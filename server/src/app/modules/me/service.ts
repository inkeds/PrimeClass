import type { Pool, RowDataPacket } from 'mysql2/promise';

import { signAppToken } from '../../../common/auth/app-auth.js';
import { executeStatement, queryFirst, queryRows } from '../../../common/db/query.js';
import { AppError } from '../../../common/errors/app-error.js';
import { verifyPassword } from '../../../common/utils/password.js';
import { getAppUserProfile, getMembershipSnapshot } from '../../shared/user-service.js';

type UserLoginRow = RowDataPacket & {
  id: string;
  login_account: string | null;
  phone: string | null;
  password_hash: string | null;
  nickname: string;
  status: string;
  session_version: number;
};

type UserProfileExtRow = RowDataPacket & {
  user_id: string;
  ext_json: string | Record<string, unknown> | null;
  updated_at: string;
};

type SystemNotificationRow = RowDataPacket & {
  notification_id: string;
  title: string;
  content: string;
  tone: 'info' | 'warning' | 'success' | 'vip';
  published_at: string | null;
  created_at: string;
};

export type MeNotificationSettings = {
  email_course_update: boolean;
  email_membership_expiry: boolean;
  email_system_notice: boolean;
  in_app_system_notice: boolean;
};

type MeMessageItem = {
  message_id: string;
  title: string;
  content: string;
  tone: 'info' | 'warning' | 'success' | 'vip';
  created_at: string | null;
};

const DEFAULT_NOTIFICATION_SETTINGS: MeNotificationSettings = {
  email_course_update: true,
  email_membership_expiry: true,
  email_system_notice: true,
  in_app_system_notice: true,
};

export async function loginAppUser(
  db: Pool,
  input: {
    login_type?: string;
    account?: string | null;
    password?: string | null;
    sms_code?: string | null;
    loginIp?: string | null;
  },
) {
  const loginType = input.login_type ?? 'password';

  if (loginType !== 'password') {
    throw new AppError(422, 42200, '当前版本仅支持账号密码登录');
  }

  if (!input.account || !input.password) {
    throw new AppError(400, 40001, '请输入账号和密码');
  }

  const user = await queryFirst<UserLoginRow>(
    db,
    `
      SELECT
        id,
        login_account,
        phone,
        password_hash,
        nickname,
        status,
        session_version
      FROM users
      WHERE deleted_at IS NULL
        AND (login_account = :account OR phone = :account)
      LIMIT 1
    `,
    { account: input.account.trim() },
  );

  if (!user || !user.password_hash || !verifyPassword(input.password, user.password_hash)) {
    throw new AppError(401, 40100, '账号或密码错误');
  }

  if (user.status !== 'normal') {
    throw new AppError(403, 40300, '当前账号已被禁用');
  }

  await executeStatement(
    db,
    `
      UPDATE users
      SET
        last_login_at = NOW(),
        last_login_ip = :loginIp
      WHERE id = :userId
    `,
    {
      userId: user.id,
      loginIp: input.loginIp ?? null,
    },
  );

  const [profile, membership] = await Promise.all([
    getAppUserProfile(db, user.id),
    getMembershipSnapshot(db, user.id),
  ]);

  return {
    token: signAppToken({
      user_id: user.id,
      login_account: user.login_account,
      session_version: Number(user.session_version ?? 0),
    }),
    user_info: {
      user_id: profile.user_id,
      nickname: profile.nickname,
      avatar: profile.avatar,
      user_level: membership.is_permanent || membership.status === 'active' ? 'vip' : 'normal',
      register_source: profile.register_source,
    },
    membership: serializeMembershipForApp(membership),
  };
}

export async function getCurrentUserInfo(db: Pool, userId: string) {
  const [profile, membership, profileExt, messageList] = await Promise.all([
    getAppUserProfile(db, userId),
    getMembershipSnapshot(db, userId),
    getUserProfileExt(db, userId),
    listPublishedNotifications(db),
  ]);

  const { email, notificationSettings } = readPreferenceState(profileExt);
  const messageCount = notificationSettings.in_app_system_notice ? messageList.length : 0;

  return {
    user_id: profile.user_id,
    nickname: profile.nickname,
    avatar: profile.avatar,
    user_level: membership.is_permanent || membership.status === 'active' ? 'vip' : 'normal',
    membership_status: membership.status,
    membership_expired_at: membership.expired_at,
    login_account: profile.login_account,
    phone: profile.phone,
    register_source: profile.register_source,
    created_at: profile.created_at,
    last_login_at: profile.last_login_at,
    email,
    notification_settings: notificationSettings,
    message_list: messageList,
    message_count: messageCount,
  };
}

export async function updateCurrentUserEmail(db: Pool, userId: string, email: string | null) {
  const row = await getUserProfileExt(db, userId);
  const ext = parseJsonObject(row?.ext_json ?? null);

  if (email) {
    ext.email = email;
  } else {
    delete ext.email;
  }

  await saveUserProfileExt(db, userId, ext);
  return getCurrentUserInfo(db, userId);
}

export async function updateCurrentUserNotifications(
  db: Pool,
  userId: string,
  settings: Partial<MeNotificationSettings>,
) {
  const row = await getUserProfileExt(db, userId);
  const ext = parseJsonObject(row?.ext_json ?? null);
  const currentSettings = normalizeNotificationSettings(ext.notification_settings);

  ext.notification_settings = {
    ...currentSettings,
    ...settings,
  };

  await saveUserProfileExt(db, userId, ext);
  return getCurrentUserInfo(db, userId);
}

export async function logoutAppUser(db: Pool, userId: string) {
  await executeStatement(
    db,
    `
      UPDATE users
      SET session_version = session_version + 1
      WHERE id = :userId
    `,
    { userId },
  );

  return {
    success: true,
  };
}

export function serializeMembershipForApp(membership: Awaited<ReturnType<typeof getMembershipSnapshot>>) {
  return {
    status: membership.status,
    package_name: membership.package_name,
    package_tone: membership.package_tone,
    started_at: membership.started_at,
    expired_at: membership.expired_at,
    is_permanent: membership.is_permanent,
  };
}

async function getUserProfileExt(db: Pool, userId: string) {
  return queryFirst<UserProfileExtRow>(
    db,
    `
      SELECT user_id, ext_json, updated_at
      FROM user_profiles
      WHERE user_id = :userId
      LIMIT 1
    `,
    { userId },
  );
}

async function saveUserProfileExt(db: Pool, userId: string, ext: Record<string, unknown>) {
  await executeStatement(
    db,
    `
      INSERT INTO user_profiles (
        user_id,
        ext_json
      )
      VALUES (
        :userId,
        :extJson
      )
      ON DUPLICATE KEY UPDATE
        ext_json = VALUES(ext_json)
    `,
    {
      userId,
      extJson: JSON.stringify(ext),
    },
  );
}

function readPreferenceState(row: UserProfileExtRow | null) {
  const ext = parseJsonObject(row?.ext_json ?? null);

  return {
    email: readOptionalString(ext.email),
    notificationSettings: normalizeNotificationSettings(ext.notification_settings),
  };
}

function normalizeNotificationSettings(value: unknown): MeNotificationSettings {
  const parsed =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};

  return {
    email_course_update: readOptionalBoolean(parsed.email_course_update, DEFAULT_NOTIFICATION_SETTINGS.email_course_update),
    email_membership_expiry: readOptionalBoolean(
      parsed.email_membership_expiry,
      DEFAULT_NOTIFICATION_SETTINGS.email_membership_expiry,
    ),
    email_system_notice: readOptionalBoolean(
      parsed.email_system_notice,
      DEFAULT_NOTIFICATION_SETTINGS.email_system_notice,
    ),
    in_app_system_notice: readOptionalBoolean(
      parsed.in_app_system_notice,
      DEFAULT_NOTIFICATION_SETTINGS.in_app_system_notice,
    ),
  };
}

async function listPublishedNotifications(db: Pool): Promise<MeMessageItem[]> {
  const rows = await queryRows<SystemNotificationRow>(
    db,
    `
      SELECT
        id AS notification_id,
        title,
        content,
        tone,
        published_at,
        created_at
      FROM system_notifications
      WHERE status = 'published'
        AND (published_at IS NULL OR published_at <= NOW())
      ORDER BY COALESCE(published_at, created_at) DESC, id DESC
      LIMIT 20
    `,
  );

  return rows.map((row) => ({
    message_id: row.notification_id,
    title: row.title,
    content: row.content,
    tone: row.tone,
    created_at: row.published_at ?? row.created_at,
  }));
}

function parseJsonObject(value: string | Record<string, unknown> | null) {
  if (!value) {
    return {};
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return {};
  }

  return {};
}

function readOptionalString(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readOptionalBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}
