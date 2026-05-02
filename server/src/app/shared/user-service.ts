import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';

import { queryFirst } from '../../common/db/query.js';
import { assertFound } from '../../common/errors/app-error.js';

type SqlExecutor = Pool | PoolConnection;

type UserRow = RowDataPacket & {
  id: string;
  user_no: string;
  login_account: string | null;
  phone: string | null;
  nickname: string;
  avatar_asset_id: string | null;
  avatar_url: string | null;
  register_source: string;
  status: string;
  last_login_at: string | null;
  last_login_ip: string | null;
  created_at: string;
};

type UserMembershipRow = RowDataPacket & {
  user_id: string;
  current_package_id: string | null;
  package_name: string | null;
  package_tone: string | null;
  membership_status: string | null;
  started_at: string | null;
  expired_at: string | null;
  is_permanent: number | null;
  source_type: string | null;
};

export type AppUserProfile = {
  user_id: string;
  user_no: string;
  login_account: string | null;
  phone: string | null;
  nickname: string;
  avatar: string | null;
  avatar_asset_id: string | null;
  register_source: string;
  status: string;
  last_login_at: string | null;
  last_login_ip: string | null;
  created_at: string;
};

export type MembershipSnapshot = {
  package_id: string | null;
  package_name: string | null;
  package_tone: string | null;
  status: 'normal' | 'active' | 'expired' | 'permanent';
  started_at: string | null;
  expired_at: string | null;
  is_permanent: boolean;
  source_type: string | null;
};

export async function getAppUserProfile(db: SqlExecutor, userId: string): Promise<AppUserProfile> {
  const row = assertFound(
    await queryFirst<UserRow>(
      db,
      `
        SELECT
          u.id,
          u.user_no,
          u.login_account,
          u.phone,
          u.nickname,
          u.avatar_asset_id,
          a.public_url AS avatar_url,
          u.register_source,
          u.status,
          u.last_login_at,
          u.last_login_ip,
          u.created_at
        FROM users u
        LEFT JOIN assets a ON a.id = u.avatar_asset_id
        WHERE u.id = :userId
          AND u.deleted_at IS NULL
        LIMIT 1
      `,
      { userId },
    ),
    '用户不存在',
  );

  return {
    user_id: row.id,
    user_no: row.user_no,
    login_account: row.login_account,
    phone: row.phone,
    nickname: row.nickname,
    avatar: row.avatar_url,
    avatar_asset_id: row.avatar_asset_id,
    register_source: row.register_source,
    status: row.status,
    last_login_at: row.last_login_at,
    last_login_ip: row.last_login_ip,
    created_at: row.created_at,
  };
}

export async function getMembershipSnapshot(
  db: SqlExecutor,
  userId: string,
): Promise<MembershipSnapshot> {
  const row = await queryFirst<UserMembershipRow>(
    db,
    `
      SELECT
        um.user_id,
        um.current_package_id,
        p.package_name,
        p.package_tone,
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
  );

  if (!row) {
    return {
      package_id: null,
      package_name: null,
      package_tone: null,
      status: 'normal',
      started_at: null,
      expired_at: null,
      is_permanent: false,
      source_type: null,
    };
  }

  const isPermanent = Boolean(row.is_permanent);
  const isExpired =
    !isPermanent &&
    Boolean(row.expired_at) &&
    new Date((row.expired_at as string).replace(' ', 'T')).getTime() < Date.now();

  return {
    package_id: row.current_package_id,
    package_name: row.package_name,
    package_tone: row.package_tone,
    status: isPermanent
      ? 'permanent'
      : isExpired
        ? 'expired'
        : row.membership_status === 'active'
          ? 'active'
          : row.membership_status === 'expired'
            ? 'expired'
            : 'normal',
    started_at: row.started_at,
    expired_at: row.expired_at,
    is_permanent: isPermanent,
    source_type: row.source_type,
  };
}

export function hasActiveMembership(snapshot: MembershipSnapshot): boolean {
  if (snapshot.is_permanent) {
    return true;
  }

  if (snapshot.status !== 'active') {
    return false;
  }

  if (!snapshot.expired_at) {
    return true;
  }

  return new Date(snapshot.expired_at.replace(' ', 'T')).getTime() >= Date.now();
}
