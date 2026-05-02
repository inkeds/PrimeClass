import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';

import { buildSerial } from '../../../common/utils/code.js';
import { normalizePagination } from '../../../common/utils/pagination.js';
import { executeStatement, queryFirst, queryRows, withTransaction } from '../../../common/db/query.js';
import { AppError, assertFound } from '../../../common/errors/app-error.js';
import { deleteFileByStorageConfig, uploadFileByStorageConfig } from '../../../common/storage/service.js';

type CountRow = RowDataPacket & {
  total: string | number;
};

type CourseRow = RowDataPacket & {
  id: string;
  course_no: string;
  course_type: string;
  title: string;
  subtitle: string | null;
  subject_code: string | null;
  grade_code: string | null;
  term_code: string | null;
  version_code: string | null;
  teacher_name: string | null;
  description: string | null;
  recommendation: string | null;
  cover_asset_id: string | null;
  cover_url: string | null;
  access_type: string;
  status: string;
  view_count: number;
  favorite_count: number;
  sort_order: number;
  published_at: string | null;
  creator_admin_id: string | null;
  created_at: string;
  updated_at: string;
};

type LessonRow = RowDataPacket & {
  id: string;
  course_id: string;
  parent_id: string | null;
  node_type: string;
  lesson_no: string | null;
  title: string;
  sort_order: number;
  status: string;
  video_asset_id: string | null;
  handout_asset_id: string | null;
  note_template_asset_id: string | null;
  duration_seconds: number;
  is_preview: number;
  access_type: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

type TopicTagRow = RowDataPacket & {
  id: string;
  tag_code: string;
  tag_name: string;
  subject_code: string | null;
  sort_order: number;
  status: string;
  remark: string | null;
  created_at: string;
  updated_at: string;
};

type AssetRow = RowDataPacket & {
  id: string;
  asset_no: string;
  provider: string;
  bucket_or_root: string | null;
  object_key: string;
  origin_name: string;
  stored_name: string | null;
  asset_type: string;
  business_type: string | null;
  mime_type: string | null;
  ext: string | null;
  size: number;
  public_url: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type CourseTopicTagRow = RowDataPacket & {
  tag_id: string;
  tag_code: string;
  tag_name: string;
  subject_code: string | null;
};

type CourseAssetRow = RowDataPacket & {
  relation_id: string;
  asset_role: string;
  sort_order: number;
  lesson_id: string | null;
  asset_id: string;
  asset_no: string;
  provider: string;
  object_key: string;
  origin_name: string;
  public_url: string | null;
  asset_type: string;
};

export async function listCourses(
  db: Pool,
  query: {
    course_type?: string;
    subject?: string;
    grade?: string;
    term?: string;
    version?: string;
    access_type?: string;
    status?: string;
    keyword?: string;
    page?: number;
    page_size?: number;
  },
) {
  const pagination = normalizePagination(query.page, query.page_size);
  const params: Record<string, unknown> = {
    limit: pagination.pageSize,
    offset: pagination.offset,
  };
  const conditions = ['c.deleted_at IS NULL'];

  if (query.course_type) {
    params.courseType = query.course_type;
    conditions.push('c.course_type = :courseType');
  }

  if (query.subject) {
    params.subjectCode = query.subject;
    conditions.push('c.subject_code = :subjectCode');
  }

  if (query.grade) {
    params.gradeCode = query.grade;
    conditions.push('c.grade_code = :gradeCode');
  }

  if (query.term) {
    params.termCode = query.term;
    conditions.push('c.term_code = :termCode');
  }

  if (query.version) {
    params.versionCode = query.version;
    conditions.push('c.version_code = :versionCode');
  }

  if (query.access_type) {
    params.accessType = query.access_type;
    conditions.push('c.access_type = :accessType');
  }

  if (query.status) {
    params.status = query.status;
    conditions.push('c.status = :status');
  }

  if (query.keyword) {
    params.keyword = `%${query.keyword}%`;
    conditions.push('(c.title LIKE :keyword OR c.teacher_name LIKE :keyword OR c.course_no LIKE :keyword)');
  }

  const whereClause = conditions.join(' AND ');
  const [list, total] = await Promise.all([
    queryRows<CourseRow>(
      db,
      `
        SELECT
          c.id,
          c.course_no,
          c.course_type,
          c.title,
          c.subtitle,
          c.subject_code,
          c.grade_code,
          c.term_code,
          c.version_code,
          c.teacher_name,
          c.description,
          c.recommendation,
          c.cover_asset_id,
          a.public_url AS cover_url,
          c.access_type,
          c.status,
          c.view_count,
          c.favorite_count,
          c.sort_order,
          c.published_at,
          c.creator_admin_id,
          c.created_at,
          c.updated_at
        FROM courses c
        LEFT JOIN assets a ON a.id = c.cover_asset_id
        WHERE ${whereClause}
        ORDER BY c.sort_order DESC, c.id DESC
        LIMIT :limit OFFSET :offset
      `,
      params,
    ),
    readCount(db, `SELECT COUNT(*) AS total FROM courses c WHERE ${whereClause}`, params),
  ]);

  return {
    list: list.map(serializeCourse),
    pagination: {
      page: pagination.page,
      page_size: pagination.pageSize,
      total,
    },
  };
}

export async function createCourse(
  db: Pool,
  input: CourseMutationInput,
  adminId: string,
) {
  return withTransaction(db, async (connection) => {
    const courseNo = buildSerial('C', 6);
    const result = await executeStatement(
      connection,
      `
        INSERT INTO courses (
          course_no,
          course_type,
          title,
          subtitle,
          subject_code,
          grade_code,
          term_code,
          version_code,
          teacher_name,
          description,
          recommendation,
          cover_asset_id,
          access_type,
          status,
          sort_order,
          published_at,
          creator_admin_id
        )
        VALUES (
          :courseNo,
          :courseType,
          :title,
          :subtitle,
          :subjectCode,
          :gradeCode,
          :termCode,
          :versionCode,
          :teacherName,
          :description,
          :recommendation,
          :coverAssetId,
          :accessType,
          :status,
          :sortOrder,
          :publishedAt,
          :creatorAdminId
        )
      `,
      buildCourseParams({
        input,
        courseNo,
        creatorAdminId: adminId,
      }),
    );

    const courseId = String(result.insertId);
    await replaceCourseTopicTags(connection, courseId, input.topic_tag_ids ?? []);
    return getCourseDetail(connection, courseId);
  });
}

export async function updateCourse(
  db: Pool,
  courseId: string,
  input: CourseMutationInput,
) {
  return withTransaction(db, async (connection) => {
    await assertCourseExists(connection, courseId);
    await executeStatement(
      connection,
      `
        UPDATE courses
        SET
          course_type = :courseType,
          title = :title,
          subtitle = :subtitle,
          subject_code = :subjectCode,
          grade_code = :gradeCode,
          term_code = :termCode,
          version_code = :versionCode,
          teacher_name = :teacherName,
          description = :description,
          recommendation = :recommendation,
          cover_asset_id = :coverAssetId,
          access_type = :accessType,
          status = :status,
          sort_order = :sortOrder,
          published_at = :publishedAt
        WHERE id = :courseId
          AND deleted_at IS NULL
      `,
      {
        ...buildCourseParams({ input }),
        courseId,
      },
    );

    await replaceCourseTopicTags(connection, courseId, input.topic_tag_ids ?? []);
    return getCourseDetail(connection, courseId);
  });
}

export async function getCourseDetail(db: Pool | PoolConnection, courseId: string) {
  const [course, lessons, topicTags, assets] = await Promise.all([
    queryFirst<CourseRow>(
      db,
      `
        SELECT
          c.id,
          c.course_no,
          c.course_type,
          c.title,
          c.subtitle,
          c.subject_code,
          c.grade_code,
          c.term_code,
          c.version_code,
          c.teacher_name,
          c.description,
          c.recommendation,
          c.cover_asset_id,
          a.public_url AS cover_url,
          c.access_type,
          c.status,
          c.view_count,
          c.favorite_count,
          c.sort_order,
          c.published_at,
          c.creator_admin_id,
          c.created_at,
          c.updated_at
        FROM courses c
        LEFT JOIN assets a ON a.id = c.cover_asset_id
        WHERE c.id = :courseId
          AND c.deleted_at IS NULL
        LIMIT 1
      `,
      { courseId },
    ),
    queryRows<LessonRow>(
      db,
      `
        SELECT
          id,
          course_id,
          parent_id,
          node_type,
          lesson_no,
          title,
          sort_order,
          status,
          video_asset_id,
          handout_asset_id,
          note_template_asset_id,
          duration_seconds,
          is_preview,
          access_type,
          published_at,
          created_at,
          updated_at
        FROM course_lessons
        WHERE course_id = :courseId
          AND deleted_at IS NULL
        ORDER BY sort_order ASC, id ASC
      `,
      { courseId },
    ),
    queryRows<CourseTopicTagRow>(
      db,
      `
        SELECT
          t.id AS tag_id,
          t.tag_code,
          t.tag_name,
          t.subject_code
        FROM course_topic_tags ct
        INNER JOIN topic_tags t ON t.id = ct.tag_id
        WHERE ct.course_id = :courseId
        ORDER BY t.sort_order DESC, t.id ASC
      `,
      { courseId },
    ),
    queryRows<CourseAssetRow>(
      db,
      `
        SELECT
          ca.id AS relation_id,
          ca.asset_role,
          ca.sort_order,
          ca.lesson_id,
          a.id AS asset_id,
          a.asset_no,
          a.provider,
          a.object_key,
          a.origin_name,
          a.public_url,
          a.asset_type
        FROM course_assets ca
        INNER JOIN assets a ON a.id = ca.asset_id
        WHERE ca.course_id = :courseId
        ORDER BY ca.sort_order DESC, ca.id ASC
      `,
      { courseId },
    ),
  ]);

  const resolvedCourse = assertFound(course, '课程不存在');

  return {
    course: serializeCourse(resolvedCourse),
    lessons: lessons.map(serializeLesson),
    topic_tags: topicTags.map((item) => ({
      tag_id: item.tag_id,
      tag_code: item.tag_code,
      tag_name: item.tag_name,
      subject_code: item.subject_code,
    })),
    assets: assets.map((item) => ({
      relation_id: item.relation_id,
      asset_role: item.asset_role,
      sort_order: item.sort_order,
      lesson_id: item.lesson_id,
      asset_id: item.asset_id,
      asset_no: item.asset_no,
      provider: item.provider,
      object_key: item.object_key,
      origin_name: item.origin_name,
      public_url: item.public_url,
      asset_type: item.asset_type,
    })),
  };
}

export async function updateCourseStatus(
  db: Pool,
  courseId: string,
  status: 'published' | 'offline',
) {
  await assertCourseExists(db, courseId);
  await executeStatement(
    db,
    `
      UPDATE courses
      SET
        status = :status,
        published_at = CASE WHEN :status = 'published' THEN NOW() ELSE published_at END
      WHERE id = :courseId
        AND deleted_at IS NULL
    `,
    {
      courseId,
      status,
    },
  );

  return {
    success: true,
    course_id: courseId,
    status,
  };
}

export async function updateLessonStatus(
  db: Pool,
  lessonId: string,
  status: 'draft' | 'published' | 'offline',
) {
  await getLessonRowById(db, lessonId);
  await executeStatement(
    db,
    `
      UPDATE course_lessons
      SET
        status = :status,
        published_at = CASE WHEN :status = 'published' THEN NOW() ELSE NULL END
      WHERE id = :lessonId
        AND deleted_at IS NULL
    `,
    {
      lessonId,
      status,
    },
  );

  return getLessonById(db, lessonId);
}

export async function deleteCourse(db: Pool, courseId: string) {
  await assertCourseExists(db, courseId);
  await executeStatement(
    db,
    `
      UPDATE courses
      SET
        status = 'offline',
        deleted_at = NOW()
      WHERE id = :courseId
        AND deleted_at IS NULL
    `,
    { courseId },
  );

  return {
    success: true,
    course_id: courseId,
  };
}

export async function listLessons(db: Pool, courseId: string) {
  await assertCourseExists(db, courseId);
  const rows = await queryRows<LessonRow>(
    db,
    `
      SELECT
        id,
        course_id,
        parent_id,
        node_type,
        lesson_no,
        title,
        sort_order,
        status,
        video_asset_id,
        handout_asset_id,
        note_template_asset_id,
        duration_seconds,
        is_preview,
        access_type,
        published_at,
        created_at,
        updated_at
      FROM course_lessons
      WHERE course_id = :courseId
        AND deleted_at IS NULL
      ORDER BY sort_order ASC, id ASC
    `,
    { courseId },
  );

  return rows.map(serializeLesson);
}

export async function createLesson(
  db: Pool,
  courseId: string,
  input: LessonMutationInput,
) {
  await assertCourseExists(db, courseId);
  const normalizedInput = await normalizeLessonMutationInput(db, courseId, input);
  const sortOrder = await resolveLessonSortOrder(
    db,
    courseId,
    normalizedInput.parent_id ?? null,
    normalizedInput.sort_order,
  );
  const result = await executeStatement(
    db,
    `
      INSERT INTO course_lessons (
        course_id,
        parent_id,
        node_type,
        lesson_no,
        title,
        sort_order,
        status,
        video_asset_id,
        handout_asset_id,
        note_template_asset_id,
        duration_seconds,
        is_preview,
        access_type,
        published_at
      )
      VALUES (
        :courseId,
        :parentId,
        :nodeType,
        :lessonNo,
        :title,
        :sortOrder,
        :status,
        :videoAssetId,
        :handoutAssetId,
        :noteTemplateAssetId,
        :durationSeconds,
        :isPreview,
        :accessType,
        :publishedAt
      )
    `,
    buildLessonParams({
      courseId,
      input: {
        ...normalizedInput,
        sort_order: sortOrder,
      },
      lessonNo: normalizedInput.node_type === 'lesson' ? buildSerial('L', 6) : null,
    }),
  );

  return getLessonById(db, String(result.insertId));
}

export async function updateLesson(
  db: Pool,
  lessonId: string,
  input: LessonMutationInput,
) {
  const lesson = await getLessonRowById(db, lessonId);
  const normalizedInput = await normalizeLessonMutationInput(db, lesson.course_id, input, lessonId);
  await executeStatement(
    db,
    `
      UPDATE course_lessons
      SET
        parent_id = :parentId,
        node_type = :nodeType,
        title = :title,
        sort_order = :sortOrder,
        status = :status,
        video_asset_id = :videoAssetId,
        handout_asset_id = :handoutAssetId,
        note_template_asset_id = :noteTemplateAssetId,
        duration_seconds = :durationSeconds,
        is_preview = :isPreview,
        access_type = :accessType,
        published_at = :publishedAt
      WHERE id = :lessonId
        AND deleted_at IS NULL
    `,
      {
        ...buildLessonParams({
          courseId: lesson.course_id,
          input: normalizedInput,
          lessonNo: lesson.lesson_no,
        }),
        lessonId,
    },
  );

  return getLessonById(db, lessonId);
}

export async function deleteLesson(db: Pool, lessonId: string) {
  return withTransaction(db, async (connection) => {
    const lesson = await getLessonRowById(connection, lessonId);
    const lessonIds = await collectLessonCascadeIds(connection, lesson.course_id, lessonId);

    await executeStatement(
      connection,
      `
        UPDATE course_lessons
        SET
          status = 'offline',
          deleted_at = NOW()
        WHERE id IN (${lessonIds.map(() => '?').join(', ')})
          AND deleted_at IS NULL
      `,
      lessonIds,
    );

    return {
      success: true,
      lesson_id: lessonId,
      deleted_count: lessonIds.length,
    };
  });
}

export async function sortLessons(
  db: Pool,
  courseId: string,
  items: Array<{ lesson_id: string; sort_order: number }>,
) {
  await assertCourseExists(db, courseId);
  await withTransaction(db, async (connection) => {
    for (const item of items) {
      await executeStatement(
        connection,
        `
          UPDATE course_lessons
          SET sort_order = :sortOrder
          WHERE id = :lessonId
            AND course_id = :courseId
            AND deleted_at IS NULL
        `,
        {
          courseId,
          lessonId: item.lesson_id,
          sortOrder: item.sort_order,
        },
      );
    }
  });

  return {
    success: true,
    course_id: courseId,
  };
}

export async function listTopicTags(
  db: Pool,
  query: {
    keyword?: string;
    status?: string;
    subject?: string;
    page?: number;
    page_size?: number;
  },
) {
  const pagination = normalizePagination(query.page, query.page_size);
  const params: Record<string, unknown> = {
    limit: pagination.pageSize,
    offset: pagination.offset,
  };
  const conditions = ['1 = 1'];

  if (query.keyword) {
    params.keyword = `%${query.keyword}%`;
    conditions.push('(tag_name LIKE :keyword OR tag_code LIKE :keyword)');
  }

  if (query.status) {
    params.status = query.status;
    conditions.push('status = :status');
  }

  if (query.subject) {
    params.subjectCode = query.subject;
    conditions.push('subject_code = :subjectCode');
  }

  const whereClause = conditions.join(' AND ');
  const [list, total] = await Promise.all([
    queryRows<TopicTagRow>(
      db,
      `
        SELECT
          id,
          tag_code,
          tag_name,
          subject_code,
          sort_order,
          status,
          remark,
          created_at,
          updated_at
        FROM topic_tags
        WHERE ${whereClause}
        ORDER BY sort_order DESC, id DESC
        LIMIT :limit OFFSET :offset
      `,
      params,
    ),
    readCount(db, `SELECT COUNT(*) AS total FROM topic_tags WHERE ${whereClause}`, params),
  ]);

  return {
    list: list.map(serializeTopicTag),
    pagination: {
      page: pagination.page,
      page_size: pagination.pageSize,
      total,
    },
  };
}

export async function createTopicTag(
  db: Pool,
  input: {
    tag_name: string;
    subject_code?: string | null;
    sort_order?: number;
    status?: string;
    remark?: string | null;
  },
) {
  const result = await executeStatement(
    db,
    `
      INSERT INTO topic_tags (
        tag_code,
        tag_name,
        subject_code,
        sort_order,
        status,
        remark
      )
      VALUES (
        :tagCode,
        :tagName,
        :subjectCode,
        :sortOrder,
        :status,
        :remark
      )
    `,
    {
      tagCode: buildSerial('TAG', 4),
      tagName: input.tag_name,
      subjectCode: input.subject_code ?? null,
      sortOrder: input.sort_order ?? 0,
      status: input.status ?? 'enabled',
      remark: input.remark ?? null,
    },
  );

  return getTopicTagById(db, String(result.insertId));
}

export async function updateTopicTag(
  db: Pool,
  tagId: string,
  input: {
    tag_name: string;
    subject_code?: string | null;
    sort_order?: number;
    status?: string;
    remark?: string | null;
  },
) {
  const current = await getTopicTagRowById(db, tagId);
  await executeStatement(
    db,
    `
      UPDATE topic_tags
      SET
        tag_name = :tagName,
        subject_code = :subjectCode,
        sort_order = :sortOrder,
        status = :status,
        remark = :remark
      WHERE id = :tagId
    `,
    {
      tagId,
      tagName: input.tag_name,
      subjectCode: input.subject_code ?? null,
      sortOrder: input.sort_order ?? current.sort_order,
      status: input.status ?? current.status,
      remark: input.remark ?? null,
    },
  );

  return getTopicTagById(db, tagId);
}

export async function deleteTopicTag(db: Pool, tagId: string) {
  await getTopicTagRowById(db, tagId);
  const linkedCount = await readCount(
    db,
    `SELECT COUNT(*) AS total FROM course_topic_tags WHERE tag_id = :tagId`,
    { tagId },
  );

  if (linkedCount > 0) {
    throw new AppError(409, 40900, '当前标签已被课程引用，无法删除');
  }

  await executeStatement(db, `DELETE FROM topic_tags WHERE id = :tagId`, { tagId });
  return {
    success: true,
    tag_id: tagId,
  };
}

export async function listAssets(
  db: Pool,
  query: {
    asset_type?: string;
    provider?: string;
    business_type?: string;
    keyword?: string;
    page?: number;
    page_size?: number;
  },
) {
  const pagination = normalizePagination(query.page, query.page_size);
  const params: Record<string, unknown> = {
    limit: pagination.pageSize,
    offset: pagination.offset,
  };
  const conditions = ['deleted_at IS NULL'];

  if (query.asset_type) {
    params.assetType = query.asset_type;
    conditions.push('asset_type = :assetType');
  }

  if (query.provider) {
    params.provider = query.provider;
    conditions.push('provider = :provider');
  }

  if (query.business_type) {
    params.businessType = query.business_type;
    conditions.push('business_type = :businessType');
  }

  if (query.keyword) {
    params.keyword = `%${query.keyword}%`;
    conditions.push('(origin_name LIKE :keyword OR object_key LIKE :keyword OR asset_no LIKE :keyword)');
  }

  const whereClause = conditions.join(' AND ');
  const [list, total] = await Promise.all([
    queryRows<AssetRow>(
      db,
      `
        SELECT
          id,
          asset_no,
          provider,
          bucket_or_root,
          object_key,
          origin_name,
          stored_name,
          asset_type,
          business_type,
          mime_type,
          ext,
          size,
          public_url,
          status,
          created_at,
          updated_at,
          deleted_at
        FROM assets
        WHERE ${whereClause}
        ORDER BY id DESC
        LIMIT :limit OFFSET :offset
      `,
      params,
    ),
    readCount(db, `SELECT COUNT(*) AS total FROM assets WHERE ${whereClause}`, params),
  ]);

  return {
    list: list.map(serializeAsset),
    pagination: {
      page: pagination.page,
      page_size: pagination.pageSize,
      total,
    },
  };
}

export async function getAssetDetail(db: Pool, assetId: string) {
  const row = await getAssetRowById(db, assetId);
  return {
    asset: serializeAsset(row),
  };
}

export async function uploadAsset(
  db: Pool,
  input: {
    preferred_provider?: string | null;
    origin_name: string;
    asset_type: string;
    business_type?: string | null;
    mime_type?: string | null;
    ext?: string | null;
    size: number;
    etag_hash?: string | null;
    local_file_path: string;
  },
  adminId: string,
) {
  const assetNo = buildSerial('AS', 8);
  const uploaded = await uploadFileByStorageConfig(db, {
    preferredProvider: input.preferred_provider ?? null,
    assetType: input.asset_type,
    businessType: input.business_type ?? null,
    originName: input.origin_name,
    mimeType: input.mime_type ?? null,
    ext: input.ext ?? null,
    localFilePath: input.local_file_path,
    etagHash: input.etag_hash ?? null,
  });

  try {
    const result = await executeStatement(
      db,
      `
        INSERT INTO assets (
          asset_no,
          provider,
          bucket_or_root,
          object_key,
          origin_name,
          stored_name,
          asset_type,
          business_type,
          mime_type,
          ext,
          size,
          etag_hash,
          public_url,
          meta_json,
          status,
          uploaded_by_admin_id
        )
        VALUES (
          :assetNo,
          :provider,
          :bucketOrRoot,
          :objectKey,
          :originName,
          :storedName,
          :assetType,
          :businessType,
          :mimeType,
          :ext,
          :size,
          :etagHash,
          :publicUrl,
          :metaJson,
          'enabled',
          :adminId
        )
      `,
      {
        assetNo,
        provider: uploaded.provider,
        bucketOrRoot: uploaded.bucketOrRoot,
        objectKey: uploaded.objectKey,
        originName: input.origin_name,
        storedName: uploaded.storedName,
        assetType: input.asset_type,
        businessType: input.business_type ?? null,
        mimeType: input.mime_type ?? null,
        ext: input.ext ?? null,
        size: input.size,
        etagHash: uploaded.etagHash,
        publicUrl: uploaded.publicUrl,
        metaJson: JSON.stringify({
          uploaded_via: 'admin_api',
        }),
        adminId,
      },
    );

    return serializeAsset(await getAssetRowById(db, String(result.insertId)));
  } catch (error) {
    await deleteFileByStorageConfig(db, {
      provider: uploaded.provider,
      objectKey: uploaded.objectKey,
      bucketOrRoot: uploaded.bucketOrRoot,
    });
    throw error;
  }
}

export async function deleteAsset(db: Pool, assetId: string) {
  const asset = await getAssetRowById(db, assetId);
  const storageDeleteResult = await deleteFileByStorageConfig(db, {
    provider: asset.provider,
    objectKey: asset.object_key,
    bucketOrRoot: asset.bucket_or_root,
  });

  await executeStatement(
    db,
    `
      UPDATE assets
      SET
        status = 'disabled',
        deleted_at = NOW()
      WHERE id = :assetId
        AND deleted_at IS NULL
    `,
    { assetId },
  );

  return {
    success: true,
    asset_id: assetId,
    storage_deleted: storageDeleteResult.deleted,
    storage_message: storageDeleteResult.message,
  };
}

type CourseMutationInput = {
  course_type: string;
  title: string;
  subtitle?: string | null;
  subject_code?: string | null;
  grade_code?: string | null;
  term_code?: string | null;
  version_code?: string | null;
  teacher_name?: string | null;
  description?: string | null;
  recommendation?: string | null;
  cover_asset_id?: string | null;
  access_type?: string;
  status?: string;
  sort_order?: number;
  topic_tag_ids?: string[];
};

type LessonMutationInput = {
  parent_id?: string | null;
  node_type: string;
  title: string;
  sort_order?: number;
  status?: string;
  video_asset_id?: string | null;
  handout_asset_id?: string | null;
  note_template_asset_id?: string | null;
  duration_seconds?: number;
  is_preview?: boolean;
  access_type?: string | null;
};

function buildCourseParams({
  input,
  courseNo,
  creatorAdminId,
}: {
  input: CourseMutationInput;
  courseNo?: string;
  creatorAdminId?: string;
}) {
  const status = input.status ?? 'draft';

  return {
    courseNo,
    courseType: input.course_type,
    title: input.title,
    subtitle: input.subtitle ?? null,
    subjectCode: input.subject_code ?? null,
    gradeCode: input.grade_code ?? null,
    termCode: input.term_code ?? null,
    versionCode: input.version_code ?? null,
    teacherName: input.teacher_name ?? null,
    description: input.description ?? null,
    recommendation: input.recommendation ?? null,
    coverAssetId: input.cover_asset_id ?? null,
    accessType: input.access_type ?? 'free',
    status,
    sortOrder: input.sort_order ?? 0,
    publishedAt: status === 'published' ? nowDateTimeString() : null,
    creatorAdminId: creatorAdminId ?? null,
  };
}

function buildLessonParams({
  courseId,
  input,
  lessonNo,
}: {
  courseId: string;
  input: LessonMutationInput;
  lessonNo: string | null;
}) {
  const status = input.status ?? 'draft';

  return {
    courseId,
    parentId: input.parent_id ?? null,
    nodeType: input.node_type,
    lessonNo,
    title: input.title,
    sortOrder: input.sort_order ?? 0,
    status,
    videoAssetId: input.video_asset_id ?? null,
    handoutAssetId: input.handout_asset_id ?? null,
    noteTemplateAssetId: input.note_template_asset_id ?? null,
    durationSeconds: input.duration_seconds ?? 0,
    isPreview: input.is_preview ? 1 : 0,
    accessType: input.access_type ?? null,
    publishedAt: status === 'published' ? nowDateTimeString() : null,
  };
}

async function normalizeLessonMutationInput(
  db: Pool | PoolConnection,
  courseId: string,
  input: LessonMutationInput,
  currentLessonId?: string,
): Promise<LessonMutationInput> {
  const normalizedParentId = input.parent_id ?? null;

  if (currentLessonId && normalizedParentId === currentLessonId) {
    throw new AppError(400, 40001, '课时节点不能挂载到自身下面');
  }

  let parentLesson: LessonRow | null = null;

  if (normalizedParentId) {
    parentLesson = await getLessonRowById(db, normalizedParentId);

    if (parentLesson.course_id !== courseId) {
      throw new AppError(400, 40001, '父级节点必须属于同一课程');
    }
  }

  if (input.node_type === 'chapter' && parentLesson) {
    throw new AppError(400, 40001, '章节节点只能挂载在课程根目录');
  }

  if (input.node_type === 'section' && parentLesson && parentLesson.node_type !== 'chapter') {
    throw new AppError(400, 40001, '小节节点只能挂载到章节下面');
  }

  if (input.node_type === 'lesson' && parentLesson && !['chapter', 'section'].includes(parentLesson.node_type)) {
    throw new AppError(400, 40001, '课时节点只能挂载到章节或小节下面');
  }

  if (currentLessonId && normalizedParentId) {
    await assertLessonParentNotCircular(db, courseId, currentLessonId, normalizedParentId);
  }

  if (
    input.node_type !== 'lesson' &&
    (input.video_asset_id ||
      input.handout_asset_id ||
      input.note_template_asset_id ||
      (input.duration_seconds ?? 0) > 0 ||
      input.is_preview ||
      input.access_type)
  ) {
    throw new AppError(400, 40001, '只有课时节点可以配置媒体、试看和访问属性');
  }

  return {
    ...input,
    parent_id: normalizedParentId,
  };
}

async function resolveLessonSortOrder(
  db: Pool | PoolConnection,
  courseId: string,
  parentId: string | null,
  requestedSortOrder?: number,
) {
  if (requestedSortOrder && requestedSortOrder > 0) {
    return requestedSortOrder;
  }

  const row = await queryFirst<RowDataPacket & { max_sort_order: number | null }>(
    db,
    `
      SELECT COALESCE(MAX(sort_order), 0) AS max_sort_order
      FROM course_lessons
      WHERE course_id = :courseId
        AND parent_id <=> :parentId
        AND deleted_at IS NULL
    `,
    {
      courseId,
      parentId,
    },
  );

  const currentMaxSortOrder = Number(row?.max_sort_order ?? 0);
  const nextSortOrder = currentMaxSortOrder + 10;
  return nextSortOrder > 0 ? nextSortOrder : 10;
}

async function assertLessonParentNotCircular(
  db: Pool | PoolConnection,
  courseId: string,
  currentLessonId: string,
  parentId: string,
) {
  let pointerId: string | null = parentId;
  const visitedIds = new Set<string>();

  while (pointerId) {
    if (pointerId === currentLessonId) {
      throw new AppError(400, 40001, '课时节点层级存在循环引用');
    }

    if (visitedIds.has(pointerId)) {
      throw new AppError(400, 40001, '课时节点层级存在循环引用');
    }

    visitedIds.add(pointerId);

    const row: (RowDataPacket & { parent_id: string | null; course_id: string }) | null = await queryFirst<
      RowDataPacket & { parent_id: string | null; course_id: string }
    >(
      db,
      `
        SELECT parent_id, course_id
        FROM course_lessons
        WHERE id = :lessonId
          AND deleted_at IS NULL
        LIMIT 1
      `,
      { lessonId: pointerId },
    );

    if (!row) {
      throw new AppError(400, 40001, '父级节点不存在');
    }

    if (row.course_id !== courseId) {
      throw new AppError(400, 40001, '父级节点必须属于同一课程');
    }

    pointerId = row.parent_id;
  }
}

async function replaceCourseTopicTags(
  connection: PoolConnection,
  courseId: string,
  topicTagIds: string[],
) {
  await executeStatement(connection, `DELETE FROM course_topic_tags WHERE course_id = :courseId`, {
    courseId,
  });

  const uniqueIds = [...new Set(topicTagIds.filter(Boolean))];

  if (uniqueIds.length === 0) {
    return;
  }

  const placeholders = uniqueIds.map((_, index) => `(:courseId${index}, :tagId${index})`);
  const params: Record<string, unknown> = {};
  uniqueIds.forEach((tagId, index) => {
    params[`courseId${index}`] = courseId;
    params[`tagId${index}`] = tagId;
  });

  await executeStatement(
    connection,
    `
      INSERT INTO course_topic_tags (
        course_id,
        tag_id
      )
      VALUES ${placeholders.join(', ')}
    `,
    params,
  );
}

async function assertCourseExists(db: Pool | PoolConnection, courseId: string) {
  return assertFound(
    await queryFirst<RowDataPacket & { id: string }>(
      db,
      `
        SELECT id
        FROM courses
        WHERE id = :courseId
          AND deleted_at IS NULL
        LIMIT 1
      `,
      { courseId },
    ),
    '课程不存在',
  );
}

async function getLessonRowById(db: Pool | PoolConnection, lessonId: string) {
  return assertFound(
    await queryFirst<LessonRow>(
      db,
      `
        SELECT
          id,
          course_id,
          parent_id,
          node_type,
          lesson_no,
          title,
          sort_order,
          status,
          video_asset_id,
          handout_asset_id,
          note_template_asset_id,
          duration_seconds,
          is_preview,
          access_type,
          published_at,
          created_at,
          updated_at
        FROM course_lessons
        WHERE id = :lessonId
          AND deleted_at IS NULL
        LIMIT 1
      `,
      { lessonId },
    ),
    '课时不存在',
  );
}

async function collectLessonCascadeIds(
  db: Pool | PoolConnection,
  courseId: string,
  rootLessonId: string,
) {
  const collectedIds = new Set<string>([rootLessonId]);
  let pendingParentIds = [rootLessonId];

  while (pendingParentIds.length > 0) {
    const rows = await queryRows<RowDataPacket & { id: string }>(
      db,
      `
        SELECT id
        FROM course_lessons
        WHERE course_id = ?
          AND deleted_at IS NULL
          AND parent_id IN (${pendingParentIds.map(() => '?').join(', ')})
      `,
      [courseId, ...pendingParentIds],
    );

    const nextParentIds: string[] = [];

    for (const row of rows) {
      if (collectedIds.has(row.id)) {
        continue;
      }

      collectedIds.add(row.id);
      nextParentIds.push(row.id);
    }

    pendingParentIds = nextParentIds;
  }

  return Array.from(collectedIds);
}

async function getLessonById(db: Pool, lessonId: string) {
  const row = await getLessonRowById(db, lessonId);
  return serializeLesson(row);
}

async function getTopicTagRowById(db: Pool, tagId: string) {
  return assertFound(
    await queryFirst<TopicTagRow>(
      db,
      `
        SELECT
          id,
          tag_code,
          tag_name,
          subject_code,
          sort_order,
          status,
          remark,
          created_at,
          updated_at
        FROM topic_tags
        WHERE id = :tagId
        LIMIT 1
      `,
      { tagId },
    ),
    '专题标签不存在',
  );
}

async function getTopicTagById(db: Pool, tagId: string) {
  const row = await getTopicTagRowById(db, tagId);
  return serializeTopicTag(row);
}

async function getAssetRowById(db: Pool, assetId: string) {
  return assertFound(
    await queryFirst<AssetRow>(
      db,
      `
        SELECT
          id,
          asset_no,
          provider,
          bucket_or_root,
          object_key,
          origin_name,
          stored_name,
          asset_type,
          business_type,
          mime_type,
          ext,
          size,
          public_url,
          status,
          created_at,
          updated_at,
          deleted_at
        FROM assets
        WHERE id = :assetId
          AND deleted_at IS NULL
        LIMIT 1
      `,
      { assetId },
    ),
    '资源不存在',
  );
}

async function readCount(
  db: Pool,
  sql: string,
  params?: Record<string, unknown>,
) {
  const row = await queryFirst<CountRow>(db, sql, params);
  const total = row?.total ?? 0;
  return typeof total === 'number' ? total : Number(total);
}

function serializeCourse(row: CourseRow) {
  return {
    course_id: row.id,
    course_no: row.course_no,
    course_type: row.course_type,
    title: row.title,
    subtitle: row.subtitle,
    subject_code: row.subject_code,
    grade_code: row.grade_code,
    term_code: row.term_code,
    version_code: row.version_code,
    teacher_name: row.teacher_name,
    description: row.description,
    recommendation: row.recommendation,
    cover_asset_id: row.cover_asset_id,
    cover_url: row.cover_url,
    access_type: row.access_type,
    status: row.status,
    view_count: row.view_count,
    favorite_count: row.favorite_count,
    sort_order: row.sort_order,
    published_at: row.published_at,
    creator_admin_id: row.creator_admin_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function serializeLesson(row: LessonRow) {
  return {
    lesson_id: row.id,
    course_id: row.course_id,
    parent_id: row.parent_id,
    node_type: row.node_type,
    lesson_no: row.lesson_no,
    title: row.title,
    sort_order: row.sort_order,
    status: row.status,
    video_asset_id: row.video_asset_id,
    handout_asset_id: row.handout_asset_id,
    note_template_asset_id: row.note_template_asset_id,
    duration_seconds: row.duration_seconds,
    is_preview: Boolean(row.is_preview),
    access_type: row.access_type,
    published_at: row.published_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function serializeTopicTag(row: TopicTagRow) {
  return {
    tag_id: row.id,
    tag_code: row.tag_code,
    tag_name: row.tag_name,
    subject_code: row.subject_code,
    sort_order: row.sort_order,
    status: row.status,
    remark: row.remark,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function serializeAsset(row: AssetRow) {
  return {
    asset_id: row.id,
    asset_no: row.asset_no,
    provider: row.provider,
    bucket_or_root: row.bucket_or_root,
    object_key: row.object_key,
    origin_name: row.origin_name,
    stored_name: row.stored_name,
    asset_type: row.asset_type,
    business_type: row.business_type,
    mime_type: row.mime_type,
    ext: row.ext,
    size: row.size,
    public_url: row.public_url,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function nowDateTimeString() {
  return formatDateTime(new Date());
}

function formatDateTime(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}
