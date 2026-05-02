import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { requireAdminAuth } from '../../../common/auth/admin-auth.js';
import { sendOk } from '../../../common/http/response.js';
import { getAdminProfile, loginAdmin, logoutAdmin } from './service.js';

const adminLoginBodySchema = z.object({
  username: z.string().trim().min(1, '请输入管理员账号'),
  password: z.string().min(1, '请输入管理员密码'),
  captcha: z.string().trim().optional(),
});

export const registerAdminAuthRoutes: FastifyPluginAsync = async (server) => {
  server.post('/auth/login', async (request, reply) => {
    const body = adminLoginBodySchema.parse(request.body ?? {});
    const data = await loginAdmin(server.db, {
      username: body.username,
      password: body.password,
      loginIp: request.ip,
      userAgent:
        typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : null,
    });

    return sendOk(request, reply, data);
  });

  server.get(
    '/auth/me',
    { preHandler: requireAdminAuth },
    async (request, reply) => {
      const data = await getAdminProfile(server.db, request.adminAuth!.admin_id);
      return sendOk(request, reply, data);
    },
  );

  server.post(
    '/auth/logout',
    { preHandler: requireAdminAuth },
    async (request, reply) => sendOk(request, reply, await logoutAdmin(server.db, request.adminAuth!.admin_id)),
  );
};
