import jwt, { type SignOptions } from 'jsonwebtoken';
import type { FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import type { RowDataPacket } from 'mysql2/promise';

import { env } from '../config/env.js';
import { queryFirst } from '../db/query.js';
import { AppError } from '../errors/app-error.js';
import type { AppAuthContext, AppJwtPayload } from './types.js';

type UserRow = RowDataPacket & {
  id: string;
  login_account: string | null;
  nickname: string;
  status: string;
  session_version: number;
};

const jwtSignOptions: SignOptions = {
  expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
};

export function signAppToken(
  payload: Pick<AppJwtPayload, 'user_id' | 'login_account' | 'session_version'>,
): string {
  return jwt.sign(
    {
      sub: payload.user_id,
      user_id: payload.user_id,
      login_account: payload.login_account,
      session_version: payload.session_version,
      type: 'app',
    },
    env.JWT_SECRET,
    jwtSignOptions,
  );
}

export const requireAppAuth: preHandlerAsyncHookHandler = async (request) => {
  request.userAuth = await resolveAppAuth(request);
};

export async function getAppAuthContext(request: FastifyRequest): Promise<AppAuthContext> {
  if (request.userAuth) {
    return request.userAuth;
  }

  const context = await resolveAppAuth(request);
  request.userAuth = context;
  return context;
}

export async function getAppAuthContextFromToken(
  request: FastifyRequest,
  token: string,
): Promise<AppAuthContext> {
  const context = await resolveAppAuth(request, token);
  request.userAuth = context;
  return context;
}

export async function tryGetAppAuthContext(request: FastifyRequest): Promise<AppAuthContext | null> {
  if (request.userAuth) {
    return request.userAuth;
  }

  if (!request.headers.authorization) {
    return null;
  }

  try {
    const context = await resolveAppAuth(request);
    request.userAuth = context;
    return context;
  } catch {
    return null;
  }
}

export async function tryGetAppAuthContextFromToken(
  request: FastifyRequest,
  token?: string | null,
): Promise<AppAuthContext | null> {
  if (!token) {
    return null;
  }

  try {
    const context = await resolveAppAuth(request, token);
    request.userAuth = context;
    return context;
  } catch {
    return null;
  }
}

async function resolveAppAuth(request: FastifyRequest, overrideToken?: string): Promise<AppAuthContext> {
  const token = overrideToken ?? getBearerToken(request.headers.authorization);
  const payload = verifyAppToken(token);

  const user = await queryFirst<UserRow>(
    request.server.db,
    `
      SELECT id, login_account, nickname, status, session_version
      FROM users
      WHERE id = :userId
        AND deleted_at IS NULL
      LIMIT 1
    `,
    { userId: payload.user_id },
  );

  if (!user || user.status !== 'normal') {
    throw new AppError(401, 40100, '用户登录状态已失效');
  }

  if (Number(user.session_version ?? 0) !== Number(payload.session_version ?? 0)) {
    throw new AppError(401, 40100, '用户登录状态已失效');
  }

  return {
    user_id: user.id,
    login_account: user.login_account,
    nickname: user.nickname,
    status: user.status,
  };
}

function getBearerToken(authorizationHeader?: string): string {
  if (!authorizationHeader) {
    throw new AppError(401, 40100, '缺少用户登录凭证');
  }

  const [type, token] = authorizationHeader.split(' ');

  if (type !== 'Bearer' || !token) {
    throw new AppError(401, 40100, '用户登录凭证格式错误');
  }

  return token;
}

function verifyAppToken(token: string): AppJwtPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);

    if (typeof decoded === 'string') {
      throw new AppError(401, 40100, '用户登录凭证无效');
    }

    if (
      decoded.type !== 'app' ||
      typeof decoded.user_id !== 'string' ||
      typeof decoded.session_version !== 'number'
    ) {
      throw new AppError(401, 40100, '用户登录凭证无效');
    }

    return decoded as AppJwtPayload;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError(401, 40100, '用户登录凭证已失效');
  }
}
