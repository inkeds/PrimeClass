import type { Pool, RowDataPacket } from 'mysql2/promise';

import { queryFirst, queryRows } from '../../../common/db/query.js';
import { normalizePagination } from '../../../common/utils/pagination.js';
import {
  buildDictionaryLookup,
  listEnabledDictionaryItems,
  resolveDictionaryPresentation,
} from '../../shared/dictionary-service.js';

type CountRow = RowDataPacket & {
  total: string | number;
};

type ContinueLearningRow = RowDataPacket & {
  record_id: string;
  course_id: string;
  course_title: string;
  teacher_name: string | null;
  cover_url: string | null;
  lesson_id: string;
  lesson_title: string;
  progress_percent: number;
  watched_seconds: number;
  last_learned_at: string | null;
};

type FavoriteCourseRow = RowDataPacket & {
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

type RecentNoteRow = RowDataPacket & {
  note_id: string;
  course_id: string;
  course_title: string;
  lesson_id: string;
  lesson_title: string;
  cover_url: string | null;
  content: string | null;
  updated_at: string;
};

export async function getLibraryOverview(db: Pool, userId: string) {
  const [historyCount, downloadCount, favoriteCount, noteCount, continueLearningList, favoriteCourseList, recentNoteList] =
    await Promise.all([
    readCount(
      db,
      `
        SELECT COUNT(*) AS total
        FROM user_learning_records r
        INNER JOIN courses c ON c.id = r.course_id
        INNER JOIN course_lessons l ON l.id = r.lesson_id
        WHERE r.user_id = :userId
          AND c.deleted_at IS NULL
          AND c.status = 'published'
          AND l.deleted_at IS NULL
          AND l.status = 'published'
      `,
      { userId },
    ),
    readCount(db, `SELECT COUNT(*) AS total FROM user_download_records WHERE user_id = :userId`, { userId }),
    readCount(db, `SELECT COUNT(*) AS total FROM user_course_favorites WHERE user_id = :userId`, { userId }),
    readCount(db, `SELECT COUNT(*) AS total FROM user_notes WHERE user_id = :userId AND status = 'enabled'`, {
      userId,
    }),
    listLearningRecords(db, userId, { page: 1, page_size: 5 }),
    listFavoriteCourses(db, userId, 4),
    listRecentNotes(db, userId, 4),
  ]);

  return {
    history_count: historyCount,
    download_count: downloadCount,
    favorite_count: favoriteCount,
    note_count: noteCount,
    continue_learning_list: continueLearningList.list,
    favorite_course_list: favoriteCourseList,
    recent_note_list: recentNoteList,
  };
}

export async function listContinueLearning(
  db: Pool,
  userId: string,
  query: {
    page?: number;
    page_size?: number;
  },
) {
  return listLearningRecords(db, userId, query);
}

export async function listHistoryRecords(
  db: Pool,
  userId: string,
  query: {
    page?: number;
    page_size?: number;
  },
) {
  return listLearningRecords(db, userId, query);
}

async function listLearningRecords(
  db: Pool,
  userId: string,
  query: {
    page?: number;
    page_size?: number;
  },
) {
  const pagination = normalizePagination(query.page, query.page_size);
  const params = {
    userId,
    limit: pagination.pageSize,
    offset: pagination.offset,
  };

  const [list, total] = await Promise.all([
    queryRows<ContinueLearningRow>(
      db,
      `
        SELECT
          r.id AS record_id,
          r.course_id,
          c.title AS course_title,
          c.teacher_name,
          a.public_url AS cover_url,
          r.lesson_id,
          l.title AS lesson_title,
          r.progress_percent,
          r.watched_seconds,
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
        LIMIT :limit OFFSET :offset
      `,
      params,
    ),
    readCount(
      db,
      `
        SELECT COUNT(*) AS total
        FROM user_learning_records r
        INNER JOIN courses c ON c.id = r.course_id
        INNER JOIN course_lessons l ON l.id = r.lesson_id
        WHERE r.user_id = :userId
          AND c.deleted_at IS NULL
          AND c.status = 'published'
          AND l.deleted_at IS NULL
          AND l.status = 'published'
      `,
      {
        userId,
      },
    ),
  ]);

  return {
    list: list.map((item) => ({
      record_id: item.record_id,
      course_id: item.course_id,
      title: item.course_title,
      teacher_name: item.teacher_name,
      cover_url: item.cover_url,
      lesson_id: item.lesson_id,
      lesson_title: item.lesson_title,
      progress: item.progress_percent,
      watched_seconds: item.watched_seconds,
      last_learned_at: item.last_learned_at,
    })),
    pagination: {
      page: pagination.page,
      page_size: pagination.pageSize,
      total,
    },
  };
}

async function listFavoriteCourses(db: Pool, userId: string, limit: number) {
  const [rows, recommendationItems] = await Promise.all([
    queryRows<FavoriteCourseRow>(
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
          (
            SELECT MAX(r.progress_percent)
            FROM user_learning_records r
            WHERE r.user_id = :userId
              AND r.course_id = c.id
          ) AS progress_percent
        FROM user_course_favorites f
        INNER JOIN courses c ON c.id = f.course_id
        LEFT JOIN assets a ON a.id = c.cover_asset_id
        WHERE f.user_id = :userId
          AND c.deleted_at IS NULL
          AND c.status = 'published'
          AND EXISTS (
            SELECT 1
            FROM course_lessons l
            WHERE l.course_id = c.id
              AND l.deleted_at IS NULL
              AND l.status = 'published'
          )
        ORDER BY f.id DESC
        LIMIT :limit
      `,
      {
        userId,
        limit,
      },
    ),
    listEnabledDictionaryItems(db, 'recommend_tag'),
  ]);
  const recommendationLookup = buildDictionaryLookup(recommendationItems);

  return rows.map((row) => {
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
  });
}

async function listRecentNotes(db: Pool, userId: string, limit: number) {
  const rows = await queryRows<RecentNoteRow>(
    db,
    `
      SELECT
        n.id AS note_id,
        n.course_id,
        c.title AS course_title,
        n.lesson_id,
        l.title AS lesson_title,
        a.public_url AS cover_url,
        n.content,
        n.updated_at
      FROM user_notes n
      INNER JOIN courses c ON c.id = n.course_id
      INNER JOIN course_lessons l ON l.id = n.lesson_id
      LEFT JOIN assets a ON a.id = c.cover_asset_id
      WHERE n.user_id = :userId
        AND n.status = 'enabled'
        AND CHAR_LENGTH(TRIM(COALESCE(n.content, ''))) > 0
        AND c.deleted_at IS NULL
        AND c.status = 'published'
        AND l.deleted_at IS NULL
        AND l.status = 'published'
      ORDER BY n.updated_at DESC, n.id DESC
      LIMIT :limit
    `,
    {
      userId,
      limit,
    },
  );

  return rows.map((row) => ({
    note_id: row.note_id,
    course_id: row.course_id,
    course_title: row.course_title,
    lesson_id: row.lesson_id,
    lesson_title: row.lesson_title,
    cover_url: row.cover_url,
    content: row.content,
    updated_at: row.updated_at,
  }));
}

async function readCount(db: Pool, sql: string, params?: Record<string, unknown>) {
  const row = await queryFirst<CountRow>(db, sql, params);
  const total = row?.total ?? 0;
  return typeof total === 'number' ? total : Number(total);
}
