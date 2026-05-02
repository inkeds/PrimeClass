import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';

import { executeStatement, queryFirst, queryRows, withTransaction } from '../../../common/db/query.js';
import { AppError, assertFound } from '../../../common/errors/app-error.js';
import { normalizePagination } from '../../../common/utils/pagination.js';
import {
  buildDictionaryLookup,
  buildDictionaryMatchValues,
  listEnabledDictionaryItems,
  resolveDictionaryPresentation,
} from '../../shared/dictionary-service.js';
import { getMembershipSnapshot, hasActiveMembership } from '../../shared/user-service.js';

type SqlExecutor = Pool | PoolConnection;

type CountRow = RowDataPacket & {
  total: string | number;
};

type CourseListRow = RowDataPacket & {
  course_id: string;
  title: string;
  teacher_name: string | null;
  cover_url: string | null;
  recommendation: string | null;
  access_type: string;
  view_count: number;
  course_type: string;
  subject_code: string | null;
  grade_code: string | null;
  term_code: string | null;
  version_code: string | null;
  progress_percent: number | null;
};

type TopicTagRow = RowDataPacket & {
  tag_id: string;
  tag_code: string;
  tag_name: string;
  subject_code: string | null;
};

type CourseDetailRow = RowDataPacket & {
  course_id: string;
  title: string;
  description: string | null;
  teacher_name: string | null;
  recommendation: string | null;
  subject_code: string | null;
  grade_code: string | null;
  term_code: string | null;
  version_code: string | null;
  access_type: string;
  cover_url: string | null;
};

type LessonListRow = RowDataPacket & {
  lesson_id: string;
  parent_id: string | null;
  node_type: string;
  title: string;
  sort_order: number;
  duration_seconds: number;
  is_preview: number;
  access_type: string | null;
  progress_percent: number | null;
};

type FavoriteRow = RowDataPacket & {
  course_id: string;
};

type CourseFavoriteCountRow = RowDataPacket & {
  favorite_count: number;
};

type PlayRow = RowDataPacket & {
  lesson_id: string;
  lesson_title: string;
  course_id: string;
  course_title: string;
  course_access_type: string;
  lesson_access_type: string | null;
  is_preview: number;
  video_asset_id: string | null;
  video_url: string | null;
  video_asset_type: string | null;
  video_mime_type: string | null;
  video_ext: string | null;
  handout_asset_id: string | null;
  handout_url: string | null;
  progress_percent: number | null;
  watched_seconds: number | null;
  note_content: string | null;
  note_updated_at: string | null;
};

type AssetFileRow = RowDataPacket & {
  asset_id: string;
  provider: string;
  bucket_or_root: string | null;
  object_key: string;
  origin_name: string;
  asset_type: string;
  mime_type: string | null;
  ext: string | null;
  size: number;
  status: string;
  public_url: string | null;
};

type AssetLessonAccessRow = RowDataPacket & {
  lesson_id: string;
  course_id: string;
  course_access_type: string;
  lesson_access_type: string | null;
  is_preview: number;
};

const PUBLIC_ASSET_TYPES = new Set(['image', 'avatar']);

type LessonNoteContextRow = RowDataPacket & {
  lesson_id: string;
  course_id: string;
  course_title: string;
  lesson_title: string;
  course_access_type: string;
  lesson_access_type: string | null;
  is_preview: number;
};

type UserNoteRow = RowDataPacket & {
  note_id: string;
  content: string | null;
  updated_at: string;
};

export async function listSyncCourses(
  db: Pool,
  query: {
    subject?: string;
    grade?: string;
    term?: string;
    version?: string;
    page?: number;
    page_size?: number;
  },
  userId?: string | null,
) {
  return listPublishedCourses(db, { ...query, course_type: 'sync' }, userId);
}

export async function listTopicTags(db: Pool) {
  const rows = await queryRows<TopicTagRow>(
    db,
    `
      SELECT id AS tag_id, tag_code, tag_name, subject_code
      FROM topic_tags
      WHERE status = 'enabled'
      ORDER BY sort_order DESC, id DESC
    `,
  );

  return rows.map((item) => ({
    tag_id: item.tag_id,
    tag_code: item.tag_code,
    tag_name: item.tag_name,
    subject_code: item.subject_code,
  }));
}

export async function listTopicCourses(
  db: Pool,
  query: {
    tag_id?: string;
    subject?: string;
    version?: string;
    page?: number;
    page_size?: number;
  },
  userId?: string | null,
) {
  return listPublishedCourses(
    db,
    {
      course_type: 'topic',
      tag_id: query.tag_id,
      subject: query.subject,
      version: query.version,
      page: query.page,
      page_size: query.page_size,
    },
    userId,
  );
}

export async function searchCourses(
  db: Pool,
  query: {
    keyword?: string;
    course_type?: string;
    subject?: string;
    grade?: string;
    version?: string;
    page?: number;
    page_size?: number;
  },
  userId?: string | null,
) {
  return listPublishedCourses(db, query, userId);
}

export async function getCourseDetail(db: Pool, courseId: string, userId?: string | null) {
  const [course, lessons, isCollected, recommendationItems] = await Promise.all([
    queryFirst<CourseDetailRow>(
      db,
      `
        SELECT
          c.id AS course_id,
          c.title,
          c.description,
          c.teacher_name,
          c.recommendation,
          c.subject_code,
          c.grade_code,
          c.term_code,
          c.version_code,
          c.access_type,
          a.public_url AS cover_url
        FROM courses c
        LEFT JOIN assets a ON a.id = c.cover_asset_id
        WHERE c.id = :courseId
          AND c.status = 'published'
          AND c.deleted_at IS NULL
          AND EXISTS (
            SELECT 1
            FROM course_lessons l
            WHERE l.course_id = c.id
              AND l.deleted_at IS NULL
              AND l.status = 'published'
          )
        LIMIT 1
      `,
      { courseId },
    ),
    queryRows<LessonListRow>(
      db,
      `
        SELECT
          l.id AS lesson_id,
          l.parent_id,
          l.node_type,
          l.title,
          l.sort_order,
          l.duration_seconds,
          l.is_preview,
          l.access_type,
          ${
            userId
              ? `
                (
                  SELECT r.progress_percent
                  FROM user_learning_records r
                  WHERE r.user_id = :userId
                    AND r.lesson_id = l.id
                  LIMIT 1
                ) AS progress_percent
              `
              : 'NULL AS progress_percent'
          }
        FROM course_lessons l
        WHERE l.course_id = :courseId
          AND l.deleted_at IS NULL
          AND l.status = 'published'
        ORDER BY l.sort_order ASC, l.id ASC
      `,
      userId ? { courseId, userId } : { courseId },
    ),
    userId
      ? queryFirst<FavoriteRow>(
          db,
          `
            SELECT course_id
            FROM user_course_favorites
            WHERE user_id = :userId
              AND course_id = :courseId
            LIMIT 1
          `,
          { userId, courseId },
        )
      : Promise.resolve(null),
    listEnabledDictionaryItems(db, 'recommend_tag'),
  ]);

  const resolvedCourse = assertFound(course, '课程不存在');
  const recommendation = resolveDictionaryPresentation(
    resolvedCourse.recommendation,
    buildDictionaryLookup(recommendationItems),
  );

  return {
    course_id: resolvedCourse.course_id,
    title: resolvedCourse.title,
    description: resolvedCourse.description,
    teacher_name: resolvedCourse.teacher_name,
    recommendation_label: recommendation?.label ?? null,
    recommendation_tone: recommendation?.tone ?? null,
    subject: resolvedCourse.subject_code,
    grade: resolvedCourse.grade_code,
    term: resolvedCourse.term_code,
    version: resolvedCourse.version_code,
    access_type: resolvedCourse.access_type,
    cover_url: resolvedCourse.cover_url,
    is_collected: Boolean(isCollected),
    lesson_list: lessons.map((lesson) => ({
      lesson_id: lesson.lesson_id,
      parent_id: lesson.parent_id,
      node_type: lesson.node_type,
      title: lesson.title,
      sort_order: lesson.sort_order,
      duration_seconds: lesson.duration_seconds,
      is_preview: Boolean(lesson.is_preview),
      access_type: lesson.access_type,
      progress: lesson.progress_percent ?? 0,
    })),
  };
}

export async function getLessonPlayDetail(db: Pool, lessonId: string, userId?: string | null) {
  const row = assertFound(
    await queryFirst<PlayRow>(
      db,
      `
        SELECT
          l.id AS lesson_id,
          l.title AS lesson_title,
          l.course_id,
          c.title AS course_title,
          c.access_type AS course_access_type,
          l.access_type AS lesson_access_type,
          l.is_preview,
          video.id AS video_asset_id,
          video.public_url AS video_url,
          video.asset_type AS video_asset_type,
          video.mime_type AS video_mime_type,
          video.ext AS video_ext,
          handout.id AS handout_asset_id,
          handout.public_url AS handout_url,
          ${
            userId
              ? `
                r.progress_percent,
                r.watched_seconds,
                (
                  SELECT n.content
                  FROM user_notes n
                  WHERE n.user_id = :userId
                    AND n.lesson_id = l.id
                    AND n.status = 'enabled'
                  ORDER BY n.updated_at DESC, n.id DESC
                  LIMIT 1
                ) AS note_content,
                (
                  SELECT n.updated_at
                  FROM user_notes n
                  WHERE n.user_id = :userId
                    AND n.lesson_id = l.id
                    AND n.status = 'enabled'
                  ORDER BY n.updated_at DESC, n.id DESC
                  LIMIT 1
                ) AS note_updated_at
              `
              : 'NULL AS progress_percent, NULL AS watched_seconds, NULL AS note_content, NULL AS note_updated_at'
          }
        FROM course_lessons l
        INNER JOIN courses c ON c.id = l.course_id
        LEFT JOIN assets video ON video.id = l.video_asset_id
        LEFT JOIN assets handout ON handout.id = l.handout_asset_id
        ${
          userId
            ? 'LEFT JOIN user_learning_records r ON r.user_id = :userId AND r.lesson_id = l.id'
            : ''
        }
        WHERE l.id = :lessonId
          AND l.deleted_at IS NULL
          AND l.status = 'published'
          AND c.deleted_at IS NULL
          AND c.status = 'published'
        LIMIT 1
      `,
      userId ? { lessonId, userId } : { lessonId },
    ),
    '课时不存在',
  );

  const membership = userId ? await getMembershipSnapshot(db, userId) : null;
  const requiresVip =
    (row.lesson_access_type ?? row.course_access_type) === 'vip' && !Boolean(row.is_preview);
  const canAccess = !requiresVip || (membership ? hasActiveMembership(membership) : false);

  return {
    lesson_id: row.lesson_id,
    lesson_title: row.lesson_title,
    media_url: canAccess ? row.video_url : null,
    media_kind: resolveMediaKind(row.video_asset_type, row.video_mime_type, row.video_ext),
    media_asset_id: canAccess ? row.video_asset_id : null,
    handout_url: canAccess ? row.handout_url : null,
    handout_asset_id: canAccess ? row.handout_asset_id : null,
    note_enabled: canAccess,
    note_content: canAccess ? row.note_content : null,
    note_updated_at: canAccess ? row.note_updated_at : null,
    progress: row.progress_percent ?? 0,
    can_access: canAccess,
    access_denied_reason: canAccess ? null : '当前课时需要开通 VIP 权益',
  };
}

export async function getAssetFileDetail(db: Pool, assetId: string, userId?: string | null) {
  const asset = assertFound(
    await queryFirst<AssetFileRow>(
      db,
      `
        SELECT
          id AS asset_id,
          provider,
          bucket_or_root,
          object_key,
          origin_name,
          asset_type,
          mime_type,
          ext,
          size,
          status,
          public_url
        FROM assets
        WHERE id = :assetId
          AND deleted_at IS NULL
        LIMIT 1
      `,
      { assetId },
    ),
    '资源不存在',
  );

  if (PUBLIC_ASSET_TYPES.has(asset.asset_type)) {
    return asset;
  }

  const bindings = await queryRows<AssetLessonAccessRow>(
    db,
    `
      SELECT
        l.id AS lesson_id,
        l.course_id,
        c.access_type AS course_access_type,
        l.access_type AS lesson_access_type,
        l.is_preview
      FROM course_lessons l
      INNER JOIN courses c ON c.id = l.course_id
      WHERE l.video_asset_id = :assetId
        AND l.deleted_at IS NULL
        AND l.status = 'published'
        AND c.deleted_at IS NULL
        AND c.status = 'published'
      UNION ALL
      SELECT
        l.id AS lesson_id,
        l.course_id,
        c.access_type AS course_access_type,
        l.access_type AS lesson_access_type,
        l.is_preview
      FROM course_lessons l
      INNER JOIN courses c ON c.id = l.course_id
      WHERE l.handout_asset_id = :assetId
        AND l.deleted_at IS NULL
        AND l.status = 'published'
        AND c.deleted_at IS NULL
        AND c.status = 'published'
    `,
    { assetId },
  );

  if (bindings.length === 0) {
    throw new AppError(403, 40300, '当前资源不可访问');
  }

  let membershipLoaded = false;
  let membership: Awaited<ReturnType<typeof getMembershipSnapshot>> | null = null;

  for (const binding of bindings) {
    const requiresVip =
      (binding.lesson_access_type ?? binding.course_access_type) === 'vip' && !Boolean(binding.is_preview);

    if (!requiresVip) {
      return asset;
    }

    if (!membershipLoaded && userId) {
      membership = await getMembershipSnapshot(db, userId);
      membershipLoaded = true;
    }

    if (membership && hasActiveMembership(membership)) {
      return asset;
    }
  }

  if (!userId) {
    throw new AppError(401, 40100, '请先登录后访问资源');
  }

  throw new AppError(403, 40300, '当前资源需要开通 VIP 权益');
}

export async function updateLearningProgress(
  db: Pool,
  input: {
    userId: string;
    course_id: string;
    lesson_id: string;
    progress: number;
    watched_seconds: number;
  },
) {
  const lesson = assertFound(
    await queryFirst<RowDataPacket & { lesson_id: string }>(
      db,
      `
        SELECT l.id AS lesson_id
        FROM course_lessons l
        INNER JOIN courses c ON c.id = l.course_id
        WHERE l.id = :lessonId
          AND l.course_id = :courseId
          AND l.deleted_at IS NULL
          AND l.status = 'published'
          AND c.deleted_at IS NULL
          AND c.status = 'published'
        LIMIT 1
      `,
      {
        courseId: input.course_id,
        lessonId: input.lesson_id,
      },
    ),
    '课时不存在',
  );

  const progress = Math.max(0, Math.min(100, input.progress));
  const watchedSeconds = Math.max(0, input.watched_seconds);

  await executeStatement(
    db,
    `
      INSERT INTO user_learning_records (
        user_id,
        course_id,
        lesson_id,
        progress_percent,
        watched_seconds,
        last_position_seconds,
        is_completed,
        learn_source,
        first_learned_at,
        last_learned_at
      )
      VALUES (
        :userId,
        :courseId,
        :lessonId,
        :progressPercent,
        :watchedSeconds,
        :lastPositionSeconds,
        :isCompleted,
        'app',
        NOW(),
        NOW()
      )
      ON DUPLICATE KEY UPDATE
        course_id = VALUES(course_id),
        progress_percent = VALUES(progress_percent),
        watched_seconds = VALUES(watched_seconds),
        last_position_seconds = VALUES(last_position_seconds),
        is_completed = VALUES(is_completed),
        learn_source = VALUES(learn_source),
        last_learned_at = VALUES(last_learned_at)
    `,
    {
      userId: input.userId,
      courseId: input.course_id,
      lessonId: lesson.lesson_id,
      progressPercent: progress,
      watchedSeconds,
      lastPositionSeconds: watchedSeconds,
      isCompleted: progress >= 100 ? 1 : 0,
    },
  );

  return {
    updated: true,
  };
}

export async function setCourseFavorite(
  db: Pool,
  input: {
    userId: string;
    courseId: string;
    collected: boolean;
  },
) {
  return withTransaction(db, async (connection) => {
    await assertPublishedCourseExists(connection, input.courseId);

    if (input.collected) {
      const insertResult = await executeStatement(
        connection,
        `
          INSERT IGNORE INTO user_course_favorites (
            user_id,
            course_id
          )
          VALUES (
            :userId,
            :courseId
          )
        `,
        {
          userId: input.userId,
          courseId: input.courseId,
        },
      );

      if (insertResult.affectedRows > 0) {
        await executeStatement(
          connection,
          `
            UPDATE courses
            SET favorite_count = favorite_count + 1
            WHERE id = :courseId
          `,
          {
            courseId: input.courseId,
          },
        );
      }
    } else {
      const deleteResult = await executeStatement(
        connection,
        `
          DELETE FROM user_course_favorites
          WHERE user_id = :userId
            AND course_id = :courseId
        `,
        {
          userId: input.userId,
          courseId: input.courseId,
        },
      );

      if (deleteResult.affectedRows > 0) {
        await executeStatement(
          connection,
          `
            UPDATE courses
            SET favorite_count = CASE
              WHEN favorite_count > 0 THEN favorite_count - 1
              ELSE 0
            END
            WHERE id = :courseId
          `,
          {
            courseId: input.courseId,
          },
        );
      }
    }

    const favoriteStats = await queryFirst<CourseFavoriteCountRow>(
      connection,
      `
        SELECT favorite_count
        FROM courses
        WHERE id = :courseId
        LIMIT 1
      `,
      {
        courseId: input.courseId,
      },
    );

    return {
      collected: input.collected,
      favorite_count: favoriteStats?.favorite_count ?? 0,
    };
  });
}

export async function saveLessonNote(
  db: Pool,
  input: {
    userId: string;
    lessonId: string;
    content: string;
  },
) {
  const normalizedContent = input.content.replace(/\r\n/g, '\n').trim();

  if (normalizedContent.length > 5000) {
    throw new AppError(422, 42200, '笔记内容不能超过 5000 个字符');
  }

  return withTransaction(db, async (connection) => {
    const lesson = await getLessonNoteContext(connection, input.lessonId, input.userId);
    const existingNote = await queryFirst<UserNoteRow>(
      connection,
      `
        SELECT
          id AS note_id,
          content,
          updated_at
        FROM user_notes
        WHERE user_id = :userId
          AND lesson_id = :lessonId
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
        FOR UPDATE
      `,
      {
        userId: input.userId,
        lessonId: input.lessonId,
      },
    );

    if (!normalizedContent) {
      if (existingNote) {
        await executeStatement(
          connection,
          `
            UPDATE user_notes
            SET
              content = '',
              status = 'disabled'
            WHERE id = :noteId
          `,
          {
            noteId: existingNote.note_id,
          },
        );
      }

      return {
        note_id: existingNote?.note_id ?? null,
        content: null,
        updated_at: null,
      };
    }

    if (existingNote) {
      await executeStatement(
        connection,
        `
          UPDATE user_notes
          SET
            course_id = :courseId,
            content = :content,
            status = 'enabled'
          WHERE id = :noteId
        `,
        {
          noteId: existingNote.note_id,
          courseId: lesson.course_id,
          content: normalizedContent,
        },
      );
    } else {
      await executeStatement(
        connection,
        `
          INSERT INTO user_notes (
            user_id,
            course_id,
            lesson_id,
            content,
            status
          )
          VALUES (
            :userId,
            :courseId,
            :lessonId,
            :content,
            'enabled'
          )
        `,
        {
          userId: input.userId,
          courseId: lesson.course_id,
          lessonId: lesson.lesson_id,
          content: normalizedContent,
        },
      );
    }

    const savedNote = await queryFirst<UserNoteRow>(
      connection,
      `
        SELECT
          id AS note_id,
          content,
          updated_at
        FROM user_notes
        WHERE user_id = :userId
          AND lesson_id = :lessonId
          AND status = 'enabled'
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
      `,
      {
        userId: input.userId,
        lessonId: input.lessonId,
      },
    );

    return {
      note_id: savedNote?.note_id ?? null,
      content: savedNote?.content ?? normalizedContent,
      updated_at: savedNote?.updated_at ?? null,
    };
  });
}

function resolveMediaKind(assetType?: string | null, mimeType?: string | null, ext?: string | null) {
  if (assetType === 'audio') {
    return 'audio' as const;
  }

  if (assetType === 'video') {
    return 'video' as const;
  }

  if (mimeType?.startsWith('audio/')) {
    return 'audio' as const;
  }

  if (mimeType?.startsWith('video/')) {
    return 'video' as const;
  }

  if (ext && ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'flac'].includes(ext.toLowerCase())) {
    return 'audio' as const;
  }

  if (ext && ['mp4', 'm4v', 'mov', 'webm', 'm3u8'].includes(ext.toLowerCase())) {
    return 'video' as const;
  }

  return 'unknown' as const;
}

async function assertPublishedCourseExists(executor: SqlExecutor, courseId: string) {
  return assertFound(
    await queryFirst<RowDataPacket & { course_id: string }>(
      executor,
      `
        SELECT c.id AS course_id
        FROM courses c
        WHERE c.id = :courseId
          AND c.status = 'published'
          AND c.deleted_at IS NULL
          AND EXISTS (
            SELECT 1
            FROM course_lessons l
            WHERE l.course_id = c.id
              AND l.deleted_at IS NULL
              AND l.status = 'published'
          )
        LIMIT 1
      `,
      {
        courseId,
      },
    ),
    '课程不存在',
  );
}

async function getLessonNoteContext(executor: SqlExecutor, lessonId: string, userId: string) {
  const lesson = assertFound(
    await queryFirst<LessonNoteContextRow>(
      executor,
      `
        SELECT
          l.id AS lesson_id,
          l.course_id,
          c.title AS course_title,
          l.title AS lesson_title,
          c.access_type AS course_access_type,
          l.access_type AS lesson_access_type,
          l.is_preview
        FROM course_lessons l
        INNER JOIN courses c ON c.id = l.course_id
        WHERE l.id = :lessonId
          AND l.deleted_at IS NULL
          AND l.status = 'published'
          AND c.deleted_at IS NULL
          AND c.status = 'published'
        LIMIT 1
      `,
      {
        lessonId,
      },
    ),
    '课时不存在',
  );

  const membership = await getMembershipSnapshot(executor, userId);
  const requiresVip =
    (lesson.lesson_access_type ?? lesson.course_access_type) === 'vip' && !Boolean(lesson.is_preview);

  if (requiresVip && !hasActiveMembership(membership)) {
    throw new AppError(403, 40300, '当前课时需要开通 VIP 权益');
  }

  return lesson;
}

async function listPublishedCourses(
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
    tag_id?: string;
    page?: number;
    page_size?: number;
  },
  userId?: string | null,
) {
  const pagination = normalizePagination(query.page, query.page_size);
  const [subjectValues, gradeValues, termValues, versionValues] = await Promise.all([
    buildDictionaryMatchValues(db, 'subject', query.subject),
    buildDictionaryMatchValues(db, 'grade', query.grade),
    buildDictionaryMatchValues(db, 'term', query.term),
    buildDictionaryMatchValues(db, 'version', query.version),
  ]);
  const params: Record<string, unknown> = {
    limit: pagination.pageSize,
    offset: pagination.offset,
  };
  const conditions = [
    "c.status = 'published'",
    'c.deleted_at IS NULL',
    `EXISTS (
      SELECT 1
      FROM course_lessons l
      WHERE l.course_id = c.id
        AND l.deleted_at IS NULL
        AND l.status = 'published'
    )`,
  ];
  const joins: string[] = [];

  if (query.course_type) {
    params.courseType = query.course_type;
    conditions.push('c.course_type = :courseType');
  }

  appendMatchCondition(conditions, params, 'c.subject_code', 'subjectCode', subjectValues);
  appendMatchCondition(conditions, params, 'c.grade_code', 'gradeCode', gradeValues);
  appendMatchCondition(conditions, params, 'c.term_code', 'termCode', termValues);
  appendMatchCondition(conditions, params, 'c.version_code', 'versionCode', versionValues);

  if (query.access_type) {
    params.accessType = query.access_type;
    conditions.push('c.access_type = :accessType');
  }

  if (query.keyword) {
    params.keyword = `%${query.keyword}%`;
    conditions.push('(c.title LIKE :keyword OR c.teacher_name LIKE :keyword)');
  }

  if (query.tag_id) {
    params.tagId = query.tag_id;
    joins.push('INNER JOIN course_topic_tags ct ON ct.course_id = c.id');
    conditions.push('ct.tag_id = :tagId');
  }

  const progressSelect = userId
    ? `
        (
          SELECT MAX(r.progress_percent)
          FROM user_learning_records r
          WHERE r.user_id = :userId
            AND r.course_id = c.id
        ) AS progress_percent
      `
    : 'NULL AS progress_percent';

  if (userId) {
    params.userId = userId;
  }

  const whereClause = conditions.join(' AND ');
  const joinClause = joins.join('\n');
  const [list, total, recommendationItems] = await Promise.all([
    queryRows<CourseListRow>(
      db,
      `
        SELECT
          c.id AS course_id,
          c.title,
          c.teacher_name,
          a.public_url AS cover_url,
          c.recommendation,
          c.access_type,
          c.view_count,
          c.course_type,
          c.subject_code,
          c.grade_code,
          c.term_code,
          c.version_code,
          ${progressSelect}
        FROM courses c
        ${joinClause}
        LEFT JOIN assets a ON a.id = c.cover_asset_id
        WHERE ${whereClause}
        ORDER BY c.sort_order DESC, c.id DESC
        LIMIT :limit OFFSET :offset
      `,
      params,
    ),
    readCount(
      db,
      `
        SELECT COUNT(DISTINCT c.id) AS total
        FROM courses c
        ${joinClause}
        WHERE ${whereClause}
      `,
      params,
    ),
    listEnabledDictionaryItems(db, 'recommend_tag'),
  ]);
  const recommendationLookup = buildDictionaryLookup(recommendationItems);

  return {
    list: list.map((row) => {
      const recommendation = resolveDictionaryPresentation(row.recommendation, recommendationLookup);

      return {
        course_id: row.course_id,
        title: row.title,
        cover_url: row.cover_url,
        difficulty: null,
        view_count: row.view_count,
        access_type: row.access_type,
        teacher_name: row.teacher_name,
        progress: row.progress_percent ?? 0,
        course_type: row.course_type,
        recommendation_label: recommendation?.label ?? null,
        recommendation_tone: recommendation?.tone ?? null,
        subject: row.subject_code,
        grade: row.grade_code,
        term: row.term_code,
        version: row.version_code,
      };
    }),
    pagination: {
      page: pagination.page,
      page_size: pagination.pageSize,
      total,
    },
  };
}

async function readCount(db: Pool, sql: string, params?: Record<string, unknown>) {
  const row = await queryFirst<CountRow>(db, sql, params);
  const total = row?.total ?? 0;
  return typeof total === 'number' ? total : Number(total);
}

function appendMatchCondition(
  conditions: string[],
  params: Record<string, unknown>,
  column: string,
  paramKey: string,
  values: string[],
) {
  if (values.length === 0) {
    return;
  }

  if (values.length === 1) {
    params[paramKey] = values[0];
    conditions.push(`${column} = :${paramKey}`);
    return;
  }

  const placeholders = values.map((value, index) => {
    const key = `${paramKey}${index}`;
    params[key] = value;
    return `${column} = :${key}`;
  });

  conditions.push(`(${placeholders.join(' OR ')})`);
}
