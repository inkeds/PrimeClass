import type { Pool, RowDataPacket } from 'mysql2/promise';

import { queryFirst, queryRows } from '../../../common/db/query.js';
import {
  buildDictionaryLookup,
  buildDictionaryMatchValues,
  findEnabledDictionaryItem,
  listEnabledDictionaryItems,
  matchesDictionaryExtra,
  resolveDictionaryPresentation,
} from '../../shared/dictionary-service.js';
import { getMembershipSnapshot, hasActiveMembership } from '../../shared/user-service.js';

type BannerRow = RowDataPacket & {
  id: string;
  title: string;
  subtitle: string | null;
  badge_text: string | null;
  image_url: string | null;
  link_type: string;
  link_value: string | null;
};

type ContinueLearningRow = RowDataPacket & {
  course_id: string;
  course_title: string;
  teacher_name: string | null;
  cover_url: string | null;
  lesson_id: string;
  lesson_title: string;
  progress_percent: number;
  last_learned_at: string | null;
};

type CourseRow = RowDataPacket & {
  course_id: string;
  title: string;
  teacher_name: string | null;
  cover_url: string | null;
  recommendation: string | null;
  access_type: string;
  view_count: number;
  subject_code: string | null;
  grade_code: string | null;
  term_code: string | null;
  version_code: string | null;
  progress_percent: number | null;
};

type SettingRow = RowDataPacket & {
  category: string;
  setting_key: string;
  setting_value: string | null;
  value_type: string;
};

type UserProfileRow = RowDataPacket & {
  version_code: string | null;
};

export async function getHomeData(db: Pool, userId?: string | null) {
  const [bannerList, currentVersion, continueLearning, displaySettings, membership] =
    await Promise.all([
      getBannerList(db),
      getCurrentVersion(db, userId ?? null),
      userId ? getContinueLearningCard(db, userId) : Promise.resolve(null),
      getDisplaySettings(db),
      userId ? getMembershipSnapshot(db, userId) : Promise.resolve(null),
    ]);
  const [subjectList, syncCourseList] = await Promise.all([
    getSubjectList(db, { version: currentVersion?.version_code ?? undefined }),
    getSyncCourseList(db, userId ?? null, 1, 8, currentVersion?.version_code ?? null),
  ]);

  return {
    current_version: currentVersion?.version_name ?? null,
    current_version_code: currentVersion?.version_code ?? null,
    current_version_name: currentVersion?.version_name ?? null,
    banner_list: bannerList,
    subject_list: subjectList,
    continue_learning: continueLearning,
    sync_course_list: syncCourseList.list,
    vip_entry: {
      enabled: membership ? !hasActiveMembership(membership) : true,
      vip_copy: displaySettings.vip_copy,
      redeem_copy: displaySettings.redeem_copy,
    },
  };
}

export async function getVersionList(
  db: Pool,
  query: {
    grade?: string;
    subject?: string;
  },
) {
  const [items, gradeValues, subjectValues] = await Promise.all([
    listEnabledDictionaryItems(db, 'version'),
    buildDictionaryMatchValues(db, 'grade', query.grade),
    buildDictionaryMatchValues(db, 'subject', query.subject),
  ]);

  return items
    .filter(
      (item) =>
        matchesDictionaryExtra(item.extra, 'grade', gradeValues) &&
        matchesDictionaryExtra(item.extra, 'subject', subjectValues),
    )
    .sort((left, right) => {
      const defaultDiff = Number(readBoolean(right.extra.is_default)) - Number(readBoolean(left.extra.is_default));

      if (defaultDiff !== 0) {
        return defaultDiff;
      }

      if (right.sort_order !== left.sort_order) {
        return right.sort_order - left.sort_order;
      }

      return left.id.localeCompare(right.id);
    })
    .map((item) => ({
      version_code: item.item_code,
      version_name: item.item_name,
    }));
}

export async function getSubjectList(
  db: Pool,
  query?: {
    version?: string;
  },
) {
  const [items, versionValues] = await Promise.all([
    listEnabledDictionaryItems(db, 'subject'),
    buildDictionaryMatchValues(db, 'version', query?.version),
  ]);

  return items
    .filter((item) => matchesDictionaryExtra(item.extra, 'version', versionValues))
    .filter((item) => readBoolean(item.extra.home_visible, true))
    .map((item) => ({
      subject_code: item.item_code,
      subject_name: item.item_name,
    }));
}

export async function getGradeList(
  db: Pool,
  query?: {
    subject?: string;
    version?: string;
  },
) {
  const [items, subjectValues, versionValues] = await Promise.all([
    listEnabledDictionaryItems(db, 'grade'),
    buildDictionaryMatchValues(db, 'subject', query?.subject),
    buildDictionaryMatchValues(db, 'version', query?.version),
  ]);

  return items
    .filter((item) => matchesDictionaryExtra(item.extra, 'subject', subjectValues))
    .filter((item) => matchesDictionaryExtra(item.extra, 'version', versionValues))
    .map((item) => ({
      grade_code: item.item_code,
      grade_name: item.item_name,
    }));
}

export async function getDisplaySettings(db: Pool) {
  const rows = await queryRows<SettingRow>(
    db,
    `
      SELECT category, setting_key, setting_value, value_type
      FROM system_settings
      WHERE (category = 'display' AND setting_key IN ('vip_copy', 'redeem_copy', 'banner_fallback'))
         OR (category = 'basic' AND setting_key IN ('service_phone', 'service_wechat'))
      ORDER BY category ASC, sort_order DESC, id ASC
    `,
  );

  const settingMap = new Map(rows.map((row) => [`${row.category}.${row.setting_key}`, deserializeSetting(row)]));

  return {
    customer_service: {
      phone: settingMap.get('basic.service_phone') ?? null,
      wechat: settingMap.get('basic.service_wechat') ?? null,
    },
    vip_copy: (settingMap.get('display.vip_copy') as string | null) ?? null,
    redeem_copy: (settingMap.get('display.redeem_copy') as string | null) ?? null,
    banner_fallback: (settingMap.get('display.banner_fallback') as string | null) ?? null,
  };
}

async function getBannerList(db: Pool) {
  const rows = await queryRows<BannerRow>(
    db,
    `
      SELECT
        b.id,
        b.title,
        b.subtitle,
        b.badge_text,
        a.public_url AS image_url,
        b.link_type,
        b.link_value
      FROM content_banners b
      LEFT JOIN assets a ON a.id = b.image_asset_id
      WHERE b.banner_type = 'home'
        AND b.status = 'enabled'
        AND (b.start_at IS NULL OR b.start_at <= NOW())
        AND (b.end_at IS NULL OR b.end_at >= NOW())
      ORDER BY b.sort_order DESC, b.id DESC
      LIMIT 10
    `,
  );

  return rows.map((row) => ({
    banner_id: row.id,
    title: row.title,
    subtitle: row.subtitle,
    badge_text: row.badge_text,
    image_url: row.image_url,
    link_type: row.link_type,
    link_value: row.link_value,
  }));
}

async function getCurrentVersion(db: Pool, userId: string | null) {
  if (userId) {
    const profile = await queryFirst<UserProfileRow>(
      db,
      `
        SELECT version_code
        FROM user_profiles
        WHERE user_id = :userId
        LIMIT 1
      `,
      { userId },
    );

    if (profile?.version_code) {
      const versionItem = await findEnabledDictionaryItem(db, 'version', profile.version_code);

      if (versionItem) {
        return {
          version_code: versionItem.item_code,
          version_name: versionItem.item_name,
        };
      }

      return {
        version_code: profile.version_code,
        version_name: profile.version_code,
      };
    }
  }

  const versions = await getVersionList(db, {});
  return versions[0]
    ? {
        version_code: versions[0].version_code,
        version_name: versions[0].version_name,
      }
    : null;
}

async function getContinueLearningCard(db: Pool, userId: string) {
  const row = await queryFirst<ContinueLearningRow>(
    db,
    `
      SELECT
        r.course_id,
        c.title AS course_title,
        c.teacher_name,
        a.public_url AS cover_url,
        r.lesson_id,
        l.title AS lesson_title,
        r.progress_percent,
        r.last_learned_at
      FROM user_learning_records r
      INNER JOIN courses c ON c.id = r.course_id
      INNER JOIN course_lessons l ON l.id = r.lesson_id
      LEFT JOIN assets a ON a.id = c.cover_asset_id
      WHERE r.user_id = :userId
        AND c.deleted_at IS NULL
        AND c.status = 'published'
        AND l.deleted_at IS NULL
        AND l.status = 'published'
      ORDER BY r.last_learned_at DESC, r.id DESC
      LIMIT 1
    `,
    { userId },
  );

  if (!row) {
    return null;
  }

  return {
    course_id: row.course_id,
    title: row.course_title,
    teacher_name: row.teacher_name,
    cover_url: row.cover_url,
    lesson_id: row.lesson_id,
    lesson_title: row.lesson_title,
    progress: row.progress_percent,
    last_learned_at: row.last_learned_at,
  };
}

async function getSyncCourseList(
  db: Pool,
  userId: string | null,
  page: number,
  pageSize: number,
  versionCode?: string | null,
) {
  const params: Record<string, unknown> = {
    limit: pageSize,
    offset: (page - 1) * pageSize,
  };

  const progressSelect = userId
    ? `
        ,
        (
          SELECT MAX(r.progress_percent)
          FROM user_learning_records r
          WHERE r.user_id = :userId
            AND r.course_id = c.id
        ) AS progress_percent
      `
    : ', NULL AS progress_percent';

  if (userId) {
    params.userId = userId;
  }

  const conditions = [
    `c.status = 'published'`,
    `c.deleted_at IS NULL`,
    `c.course_type = 'sync'`,
    `
      EXISTS (
        SELECT 1
        FROM course_lessons l
        WHERE l.course_id = c.id
          AND l.deleted_at IS NULL
          AND l.status = 'published'
      )
    `,
  ];

  if (versionCode) {
    params.versionCode = versionCode;
    conditions.push('c.version_code = :versionCode');
  }

  const [rows, recommendationItems] = await Promise.all([
    queryRows<CourseRow>(
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
          c.subject_code,
          c.grade_code,
          c.term_code,
          c.version_code
          ${progressSelect}
        FROM courses c
        LEFT JOIN assets a ON a.id = c.cover_asset_id
        WHERE ${conditions.join('\n        AND ')}
        ORDER BY c.sort_order DESC, c.id DESC
        LIMIT :limit OFFSET :offset
      `,
      params,
    ),
    listEnabledDictionaryItems(db, 'recommend_tag'),
  ]);
  const recommendationLookup = buildDictionaryLookup(recommendationItems);

  return {
    list: rows.map((row) => {
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
        recommendation_label: recommendation?.label ?? null,
        recommendation_tone: recommendation?.tone ?? null,
        subject: row.subject_code,
        grade: row.grade_code,
        term: row.term_code,
        version: row.version_code,
      };
    }),
  };
}

function deserializeSetting(row: SettingRow) {
  if (row.setting_value == null) {
    return null;
  }

  switch (row.value_type) {
    case 'int':
      return Number(row.setting_value);
    case 'bool':
      return row.setting_value === 'true';
    case 'json':
      try {
        return JSON.parse(row.setting_value) as unknown;
      } catch {
        return null;
      }
    default:
      return row.setting_value;
  }
}

function readBoolean(value: unknown, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value !== 0;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }

    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }

  return fallback;
}
