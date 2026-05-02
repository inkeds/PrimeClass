import jwt, { type SignOptions } from 'jsonwebtoken';
import type { FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import type { RowDataPacket } from 'mysql2/promise';

import { env } from '../config/env.js';
import { queryFirst, queryRows } from '../db/query.js';
import { AppError } from '../errors/app-error.js';
import type { AdminAuthContext, AdminJwtPayload } from './types.js';

type AdminRow = RowDataPacket & {
  id: string;
  username: string;
  real_name: string;
  status: string;
  session_version: number;
};

type RoleRow = RowDataPacket & {
  role_code: string;
};

type PermissionRow = RowDataPacket & {
  permission_key: string;
};

const jwtSignOptions: SignOptions = {
  expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
};

export function signAdminToken(
  payload: Pick<AdminJwtPayload, 'admin_id' | 'username' | 'session_version'>,
): string {
  return jwt.sign(
    {
      sub: payload.admin_id,
      admin_id: payload.admin_id,
      username: payload.username,
      session_version: payload.session_version,
      type: 'admin',
    },
    env.JWT_SECRET,
    jwtSignOptions,
  );
}

export const requireAdminAuth: preHandlerAsyncHookHandler = async (request) => {
  request.adminAuth = await resolveAdminAuth(request);
};

export async function getAdminAuthContext(request: FastifyRequest): Promise<AdminAuthContext> {
  if (request.adminAuth) {
    return request.adminAuth;
  }

  const context = await resolveAdminAuth(request);
  request.adminAuth = context;
  return context;
}

export async function getAdminAuthContextFromToken(
  request: FastifyRequest,
  token: string,
): Promise<AdminAuthContext> {
  const context = await resolveAdminAuth(request, token);
  request.adminAuth = context;
  return context;
}

export function requireAdminPermissions(...permissions: string[]): preHandlerAsyncHookHandler {
  return async (request) => {
    const adminAuth = await getAdminAuthContext(request);

    if (permissions.some((permission) => adminAuth.permissions.includes(permission))) {
      return;
    }

    throw new AppError(403, 40300, '当前账号无权访问该后台功能');
  };
}

async function resolveAdminAuth(request: FastifyRequest, overrideToken?: string): Promise<AdminAuthContext> {
  const token = overrideToken ?? getBearerToken(request.headers.authorization);
  const payload = verifyAdminToken(token);

  const admin = await queryFirst<AdminRow>(
    request.server.db,
    `
      SELECT id, username, real_name, status, session_version
      FROM admins
      WHERE id = :adminId
      LIMIT 1
    `,
    { adminId: payload.admin_id },
  );

  if (!admin || admin.status !== 'enabled') {
    throw new AppError(401, 40100, '管理员登录状态已失效');
  }

  if (Number(admin.session_version ?? 0) !== Number(payload.session_version ?? 0)) {
    throw new AppError(401, 40100, '管理员登录状态已失效');
  }

  const [roles, permissions] = await Promise.all([
    queryRows<RoleRow>(
      request.server.db,
      `
        SELECT DISTINCT r.role_code
        FROM admin_roles r
        INNER JOIN admin_user_roles ur ON ur.role_id = r.id
        WHERE ur.admin_id = :adminId
          AND r.status = 'enabled'
        ORDER BY r.sort_order DESC, r.id ASC
      `,
      { adminId: admin.id },
    ),
    queryRows<PermissionRow>(
      request.server.db,
      `
        SELECT DISTINCT p.permission_key
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

  return {
    admin_id: admin.id,
    username: admin.username,
    real_name: admin.real_name,
    status: admin.status,
    roles: roles.map((item) => item.role_code),
    permissions: permissions.map((item) => item.permission_key),
  };
}

function getBearerToken(authorizationHeader?: string): string {
  if (!authorizationHeader) {
    throw new AppError(401, 40100, '缺少管理员登录凭证');
  }

  const [type, token] = authorizationHeader.split(' ');

  if (type !== 'Bearer' || !token) {
    throw new AppError(401, 40100, '管理员登录凭证格式错误');
  }

  return token;
}

function verifyAdminToken(token: string): AdminJwtPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);

    if (typeof decoded === 'string') {
      throw new AppError(401, 40100, '管理员登录凭证无效');
    }

    if (
      decoded.type !== 'admin' ||
      typeof decoded.admin_id !== 'string' ||
      typeof decoded.session_version !== 'number'
    ) {
      throw new AppError(401, 40100, '管理员登录凭证无效');
    }

    return decoded as AdminJwtPayload;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError(401, 40100, '管理员登录凭证已失效');
  }
}
