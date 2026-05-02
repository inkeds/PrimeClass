import type { RowDataPacket } from 'mysql2/promise';
import type { Pool } from 'mysql2/promise';

import { signAdminToken } from '../../../common/auth/admin-auth.js';
import { queryFirst, queryRows, executeStatement } from '../../../common/db/query.js';
import { AppError, assertFound } from '../../../common/errors/app-error.js';
import { verifyPassword } from '../../../common/utils/password.js';

type AdminAccountRow = RowDataPacket & {
  id: string;
  username: string;
  password_hash: string;
  real_name: string;
  mobile: string | null;
  email: string | null;
  avatar_asset_id: string | null;
  status: string;
  session_version: number;
  last_login_at: string | null;
  last_login_ip: string | null;
};

type RoleRow = RowDataPacket & {
  role_code: string;
  role_name: string;
};

type PermissionRow = RowDataPacket & {
  permission_key: string;
  permission_name: string;
  module_code: string;
  group_code: string | null;
};

type LoginLogPayload = {
  adminId: string | null;
  username: string;
  loginResult: 'success' | 'failed';
  failureReason?: string | null;
  loginIp?: string | null;
  userAgent?: string | null;
};

export async function loginAdmin(
  db: Pool,
  input: {
    username: string;
    password: string;
    loginIp?: string | null;
    userAgent?: string | null;
  },
) {
  const admin = await queryFirst<AdminAccountRow>(
    db,
    `
      SELECT
        id,
        username,
        password_hash,
        real_name,
        mobile,
        email,
        avatar_asset_id,
        status,
        session_version,
        last_login_at,
        last_login_ip
      FROM admins
      WHERE username = :username
      LIMIT 1
    `,
    { username: input.username },
  );

  if (!admin) {
    await recordLoginLog(db, {
      adminId: null,
      username: input.username,
      loginResult: 'failed',
      failureReason: 'admin_not_found',
      loginIp: input.loginIp,
      userAgent: input.userAgent,
    });
    throw new AppError(401, 40100, '用户名或密码错误');
  }

  if (admin.status !== 'enabled') {
    await recordLoginLog(db, {
      adminId: admin.id,
      username: admin.username,
      loginResult: 'failed',
      failureReason: 'admin_disabled',
      loginIp: input.loginIp,
      userAgent: input.userAgent,
    });
    throw new AppError(403, 40300, '当前管理员账号已禁用');
  }

  if (!verifyPassword(input.password, admin.password_hash)) {
    await recordLoginLog(db, {
      adminId: admin.id,
      username: admin.username,
      loginResult: 'failed',
      failureReason: 'password_mismatch',
      loginIp: input.loginIp,
      userAgent: input.userAgent,
    });
    throw new AppError(401, 40100, '用户名或密码错误');
  }

  const [roles, permissions] = await Promise.all([
    queryRows<RoleRow>(
      db,
      `
        SELECT DISTINCT r.role_code, r.role_name
        FROM admin_roles r
        INNER JOIN admin_user_roles ur ON ur.role_id = r.id
        WHERE ur.admin_id = :adminId
          AND r.status = 'enabled'
        ORDER BY r.sort_order DESC, r.id ASC
      `,
      { adminId: admin.id },
    ),
    queryRows<PermissionRow>(
      db,
      `
        SELECT DISTINCT p.permission_key, p.permission_name, p.module_code, p.group_code
        FROM admin_permissions p
        INNER JOIN admin_role_permissions rp ON rp.permission_id = p.id
        INNER JOIN admin_roles r ON r.id = rp.role_id
        INNER JOIN admin_user_roles ur ON ur.role_id = r.id
        WHERE ur.admin_id = :adminId
          AND r.status = 'enabled'
        ORDER BY p.module_code ASC, p.sort_order DESC, p.id ASC
      `,
      { adminId: admin.id },
    ),
  ]);

  await Promise.all([
    executeStatement(
      db,
      `
        UPDATE admins
        SET
          last_login_at = NOW(),
          last_login_ip = :loginIp
        WHERE id = :adminId
      `,
      {
        adminId: admin.id,
        loginIp: input.loginIp ?? null,
      },
    ),
    recordLoginLog(db, {
      adminId: admin.id,
      username: admin.username,
      loginResult: 'success',
      loginIp: input.loginIp,
      userAgent: input.userAgent,
    }),
  ]);

  return {
    token: signAdminToken({
      admin_id: admin.id,
      username: admin.username,
      session_version: Number(admin.session_version ?? 0),
    }),
    admin_info: serializeAdminInfo({
      ...admin,
      last_login_at: null,
      last_login_ip: input.loginIp ?? null,
    }),
    roles: roles.map((item) => ({
      role_code: item.role_code,
      role_name: item.role_name,
    })),
    permissions: permissions.map((item) => item.permission_key),
    permission_items: permissions.map((item) => ({
      permission_key: item.permission_key,
      permission_name: item.permission_name,
      module_code: item.module_code,
      group_code: item.group_code,
    })),
  };
}

export async function getAdminProfile(db: Pool, adminId: string) {
  const admin = assertFound(
    await queryFirst<AdminAccountRow>(
      db,
      `
        SELECT
          id,
          username,
          password_hash,
          real_name,
          mobile,
          email,
          avatar_asset_id,
          status,
          session_version,
          last_login_at,
          last_login_ip
        FROM admins
        WHERE id = :adminId
        LIMIT 1
      `,
      { adminId },
    ),
    '管理员不存在',
  );

  const [roles, permissions] = await Promise.all([
    queryRows<RoleRow>(
      db,
      `
        SELECT DISTINCT r.role_code, r.role_name
        FROM admin_roles r
        INNER JOIN admin_user_roles ur ON ur.role_id = r.id
        WHERE ur.admin_id = :adminId
          AND r.status = 'enabled'
        ORDER BY r.sort_order DESC, r.id ASC
      `,
      { adminId },
    ),
    queryRows<PermissionRow>(
      db,
      `
        SELECT DISTINCT p.permission_key, p.permission_name, p.module_code, p.group_code
        FROM admin_permissions p
        INNER JOIN admin_role_permissions rp ON rp.permission_id = p.id
        INNER JOIN admin_roles r ON r.id = rp.role_id
        INNER JOIN admin_user_roles ur ON ur.role_id = r.id
        WHERE ur.admin_id = :adminId
          AND r.status = 'enabled'
        ORDER BY p.module_code ASC, p.sort_order DESC, p.id ASC
      `,
      { adminId },
    ),
  ]);

  return {
    admin_info: serializeAdminInfo(admin),
    roles: roles.map((item) => ({
      role_code: item.role_code,
      role_name: item.role_name,
    })),
    permissions: permissions.map((item) => item.permission_key),
    permission_items: permissions.map((item) => ({
      permission_key: item.permission_key,
      permission_name: item.permission_name,
      module_code: item.module_code,
      group_code: item.group_code,
    })),
  };
}

function serializeAdminInfo(admin: AdminAccountRow) {
  return {
    admin_id: admin.id,
    username: admin.username,
    real_name: admin.real_name,
    mobile: admin.mobile,
    email: admin.email,
    avatar_asset_id: admin.avatar_asset_id,
    status: admin.status,
    last_login_at: admin.last_login_at,
    last_login_ip: admin.last_login_ip,
  };
}

async function recordLoginLog(db: Pool, payload: LoginLogPayload) {
  await executeStatement(
    db,
    `
      INSERT INTO admin_login_logs (
        admin_id,
        username_snapshot,
        login_result,
        failure_reason,
        login_ip,
        user_agent
      )
      VALUES (
        :adminId,
        :username,
        :loginResult,
        :failureReason,
        :loginIp,
        :userAgent
      )
    `,
    {
      adminId: payload.adminId,
      username: payload.username,
      loginResult: payload.loginResult,
      failureReason: payload.failureReason ?? null,
      loginIp: payload.loginIp ?? null,
      userAgent: payload.userAgent ?? null,
    },
  );
}

export async function logoutAdmin(db: Pool, adminId: string) {
  await executeStatement(
    db,
    `
      UPDATE admins
      SET session_version = session_version + 1
      WHERE id = :adminId
    `,
    { adminId },
  );

  return {
    success: true,
  };
}
