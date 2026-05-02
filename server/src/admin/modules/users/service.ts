import type { Pool, RowDataPacket } from 'mysql2/promise';

import { executeStatement, queryFirst, queryRows } from '../../../common/db/query.js';
import { AppError, assertFound } from '../../../common/errors/app-error.js';
import { normalizePagination } from '../../../common/utils/pagination.js';

type CountRow = RowDataPacket & {
  total: string | number;
};

type UserListRow = RowDataPacket & {
  user_id: string;
  user_no: string;
  login_account: string | null;
  phone: string | null;
  nickname: string;
  register_source: string;
  status: string;
  created_at: string;
  last_login_at: string | null;
  membership_status: string | null;
  membership_expired_at: string | null;
  membership_is_permanent: number | null;
  last_active_at: string | null;
};

type UserDetailRow = RowDataPacket & {
  id: string;
  user_no: string;
  login_account: string | null;
  phone: string | null;
  nickname: string;
  avatar_asset_id: string | null;
  register_source: string;
  status: string;
  last_login_at: string | null;
  last_login_ip: string | null;
  created_at: string;
  updated_at: string;
};

type UserProfileRow = RowDataPacket & {
  user_id: string;
  gender: string | null;
  grade_code: string | null;
  version_code: string | null;
  province: string | null;
  city: string | null;
  school_name: string | null;
  ext_json: string | Record<string, unknown> | null;
  updated_at: string;
};

type UserMembershipRow = RowDataPacket & {
  user_id: string;
  package_id: string | null;
  package_name: string | null;
  membership_status: string;
  started_at: string | null;
  expired_at: string | null;
  is_permanent: number;
  source_type: string | null;
};

type UserRemarkRow = RowDataPacket & {
  remark_id: string;
  content: string;
  created_at: string;
  admin_id: string;
  admin_name: string | null;
};

type LearningRecordRow = RowDataPacket & {
  record_id: string;
  course_id: string;
  course_title: string | null;
  lesson_id: string;
  lesson_title: string | null;
  progress_percent: number;
  watched_seconds: number;
  last_position_seconds: number;
  is_completed: number;
  last_learned_at: string | null;
  updated_at: string;
};

export async function listUsers(
  db: Pool,
  query: {
    keyword?: string;
    membership_status?: string;
    account_status?: string;
    registered_start?: string;
    registered_end?: string;
    active_start?: string;
    active_end?: string;
    page?: number;
    page_size?: number;
  },
) {
  const pagination = normalizePagination(query.page, query.page_size);
  const params: Record<string, unknown> = {
    limit: pagination.pageSize,
    offset: pagination.offset,
  };
  const conditions = ['u.deleted_at IS NULL'];

  if (query.keyword) {
    params.keyword = `%${query.keyword}%`;
    conditions.push(
      '(u.user_no LIKE :keyword OR u.nickname LIKE :keyword OR u.phone LIKE :keyword OR u.login_account LIKE :keyword)',
    );
  }

  if (query.membership_status) {
    params.membershipStatus = query.membership_status;
    conditions.push('COALESCE(um.membership_status, \'normal\') = :membershipStatus');
  }

  if (query.account_status) {
    params.accountStatus = query.account_status;
    conditions.push('u.status = :accountStatus');
  }

  if (query.registered_start) {
    params.registeredStart = query.registered_start;
    conditions.push('u.created_at >= :registeredStart');
  }

  if (query.registered_end) {
    params.registeredEnd = query.registered_end;
    conditions.push('u.created_at <= :registeredEnd');
  }

  if (query.active_start) {
    params.activeStart = query.active_start;
    conditions.push(
      `
        COALESCE(
          (
            SELECT MAX(r.last_learned_at)
            FROM user_learning_records r
            WHERE r.user_id = u.id
          ),
          u.last_login_at,
          u.created_at
        ) >= :activeStart
      `,
    );
  }

  if (query.active_end) {
    params.activeEnd = query.active_end;
    conditions.push(
      `
        COALESCE(
          (
            SELECT MAX(r.last_learned_at)
            FROM user_learning_records r
            WHERE r.user_id = u.id
          ),
          u.last_login_at,
          u.created_at
        ) <= :activeEnd
      `,
    );
  }

  const whereClause = conditions.join(' AND ');
  const [list, total] = await Promise.all([
    queryRows<UserListRow>(
      db,
      `
        SELECT
          u.id AS user_id,
          u.user_no,
          u.login_account,
          u.phone,
          u.nickname,
          u.register_source,
          u.status,
          u.created_at,
          u.last_login_at,
          um.membership_status,
          um.expired_at AS membership_expired_at,
          um.is_permanent AS membership_is_permanent,
          COALESCE(
            (
              SELECT MAX(r.last_learned_at)
              FROM user_learning_records r
              WHERE r.user_id = u.id
            ),
            u.last_login_at,
            u.created_at
          ) AS last_active_at
        FROM users u
        LEFT JOIN user_memberships um ON um.user_id = u.id
        WHERE ${whereClause}
        ORDER BY u.id DESC
        LIMIT :limit OFFSET :offset
      `,
      params,
    ),
    readCount(
      db,
      `
        SELECT COUNT(*) AS total
        FROM users u
        LEFT JOIN user_memberships um ON um.user_id = u.id
        WHERE ${whereClause}
      `,
      params,
    ),
  ]);

  return {
    list: list.map((row) => ({
      user_id: row.user_id,
      user_no: row.user_no,
      login_account: row.login_account,
      phone: row.phone,
      nickname: row.nickname,
      register_source: row.register_source,
      status: row.status,
      created_at: row.created_at,
      last_login_at: row.last_login_at,
      membership_status: row.membership_status ?? 'normal',
      membership_expired_at: row.membership_expired_at,
      membership_is_permanent: Boolean(row.membership_is_permanent),
      last_active_at: row.last_active_at,
    })),
    pagination: {
      page: pagination.page,
      page_size: pagination.pageSize,
      total,
    },
  };
}

export async function getUserDetail(db: Pool, userId: string) {
  const [user, profile, membership, remarks] = await Promise.all([
    queryFirst<UserDetailRow>(
      db,
      `
        SELECT
          id,
          user_no,
          login_account,
          phone,
          nickname,
          avatar_asset_id,
          register_source,
          status,
          last_login_at,
          last_login_ip,
          created_at,
          updated_at
        FROM users
        WHERE id = :userId
          AND deleted_at IS NULL
        LIMIT 1
      `,
      { userId },
    ),
    queryFirst<UserProfileRow>(
      db,
      `
        SELECT
          user_id,
          gender,
          grade_code,
          version_code,
          province,
          city,
          school_name,
          ext_json,
          updated_at
        FROM user_profiles
        WHERE user_id = :userId
        LIMIT 1
      `,
      { userId },
    ),
    queryFirst<UserMembershipRow>(
      db,
      `
        SELECT
          um.user_id,
          um.current_package_id AS package_id,
          p.package_name,
          um.membership_status,
          um.started_at,
          um.expired_at,
          um.is_permanent,
          um.source_type
        FROM user_memberships um
        LEFT JOIN membership_packages p ON p.id = um.current_package_id
        WHERE um.user_id = :userId
        LIMIT 1
      `,
      { userId },
    ),
    queryRows<UserRemarkRow>(
      db,
      `
        SELECT
          r.id AS remark_id,
          r.content,
          r.created_at,
          r.admin_id,
          a.real_name AS admin_name
        FROM user_remarks r
        LEFT JOIN admins a ON a.id = r.admin_id
        WHERE r.user_id = :userId
        ORDER BY r.id DESC
      `,
      { userId },
    ),
  ]);

  const resolvedUser = assertFound(user, '用户不存在');

  return {
    user: {
      user_id: resolvedUser.id,
      user_no: resolvedUser.user_no,
      login_account: resolvedUser.login_account,
      phone: resolvedUser.phone,
      nickname: resolvedUser.nickname,
      avatar_asset_id: resolvedUser.avatar_asset_id,
      register_source: resolvedUser.register_source,
      status: resolvedUser.status,
      last_login_at: resolvedUser.last_login_at,
      last_login_ip: resolvedUser.last_login_ip,
      created_at: resolvedUser.created_at,
      updated_at: resolvedUser.updated_at,
    },
    profile: profile
      ? {
          user_id: profile.user_id,
          gender: profile.gender,
          grade_code: profile.grade_code,
          version_code: profile.version_code,
          province: profile.province,
          city: profile.city,
          school_name: profile.school_name,
          ext: parseJsonObject(profile.ext_json),
          updated_at: profile.updated_at,
        }
      : null,
    membership: membership
      ? {
          user_id: membership.user_id,
          package_id: membership.package_id,
          package_name: membership.package_name,
          membership_status: membership.membership_status,
          started_at: membership.started_at,
          expired_at: membership.expired_at,
          is_permanent: Boolean(membership.is_permanent),
          source_type: membership.source_type,
        }
      : null,
    remarks: remarks.map((item) => ({
      remark_id: item.remark_id,
      content: item.content,
      created_at: item.created_at,
      admin_id: item.admin_id,
      admin_name: item.admin_name,
    })),
  };
}

export async function getUserLearningRecords(
  db: Pool,
  userId: string,
  query: {
    page?: number;
    page_size?: number;
  },
) {
  await assertUserExists(db, userId);
  const pagination = normalizePagination(query.page, query.page_size);
  const params = {
    userId,
    limit: pagination.pageSize,
    offset: pagination.offset,
  };

  const [list, total] = await Promise.all([
    queryRows<LearningRecordRow>(
      db,
      `
        SELECT
          r.id AS record_id,
          r.course_id,
          c.title AS course_title,
          r.lesson_id,
          l.title AS lesson_title,
          r.progress_percent,
          r.watched_seconds,
          r.last_position_seconds,
          r.is_completed,
          r.last_learned_at,
          r.updated_at
        FROM user_learning_records r
        LEFT JOIN courses c ON c.id = r.course_id
        LEFT JOIN course_lessons l ON l.id = r.lesson_id
        WHERE r.user_id = :userId
        ORDER BY r.id DESC
        LIMIT :limit OFFSET :offset
      `,
      params,
    ),
    readCount(
      db,
      `SELECT COUNT(*) AS total FROM user_learning_records WHERE user_id = :userId`,
      { userId },
    ),
  ]);

  return {
    list: list.map((item) => ({
      record_id: item.record_id,
      course_id: item.course_id,
      course_title: item.course_title,
      lesson_id: item.lesson_id,
      lesson_title: item.lesson_title,
      progress_percent: item.progress_percent,
      watched_seconds: item.watched_seconds,
      last_position_seconds: item.last_position_seconds,
      is_completed: Boolean(item.is_completed),
      last_learned_at: item.last_learned_at,
      updated_at: item.updated_at,
    })),
    pagination: {
      page: pagination.page,
      page_size: pagination.pageSize,
      total,
    },
  };
}

export async function updateUserStatus(
  db: Pool,
  userId: string,
  input: {
    status: string;
    reason?: string | null;
  },
) {
  if (!['normal', 'frozen', 'canceled'].includes(input.status)) {
    throw new AppError(400, 40001, '不支持的用户状态');
  }

  await assertUserExists(db, userId);
  await executeStatement(
    db,
    `
      UPDATE users
      SET
        status = :status
      WHERE id = :userId
        AND deleted_at IS NULL
    `,
    {
      userId,
      status: input.status,
    },
  );

  return {
    success: true,
    user_id: userId,
    status: input.status,
    reason: input.reason ?? null,
  };
}

export async function createUserRemark(
  db: Pool,
  userId: string,
  adminId: string,
  content: string,
) {
  await assertUserExists(db, userId);
  const result = await executeStatement(
    db,
    `
      INSERT INTO user_remarks (
        user_id,
        admin_id,
        content
      )
      VALUES (
        :userId,
        :adminId,
        :content
      )
    `,
    {
      userId,
      adminId,
      content,
    },
  );

  const row = assertFound(
    await queryFirst<UserRemarkRow>(
      db,
      `
        SELECT
          r.id AS remark_id,
          r.content,
          r.created_at,
          r.admin_id,
          a.real_name AS admin_name
        FROM user_remarks r
        LEFT JOIN admins a ON a.id = r.admin_id
        WHERE r.id = :remarkId
        LIMIT 1
      `,
      { remarkId: String(result.insertId) },
    ),
    '备注创建失败',
  );

  return {
    remark_id: row.remark_id,
    content: row.content,
    created_at: row.created_at,
    admin_id: row.admin_id,
    admin_name: row.admin_name,
  };
}

async function assertUserExists(db: Pool, userId: string) {
  return assertFound(
    await queryFirst<RowDataPacket & { id: string }>(
      db,
      `
        SELECT id
        FROM users
        WHERE id = :userId
          AND deleted_at IS NULL
        LIMIT 1
      `,
      { userId },
    ),
    '用户不存在',
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

function parseJsonObject(value: string | Record<string, unknown> | null) {
  if (!value) {
    return {};
  }

  if (typeof value === 'object') {
    return value;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
