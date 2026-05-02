import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { requireAdminAuth, requireAdminPermissions } from '../../../common/auth/admin-auth.js';
import { sendList, sendOk } from '../../../common/http/response.js';
import {
  createUserRemark,
  getUserDetail,
  getUserLearningRecords,
  listUsers,
  updateUserStatus,
} from './service.js';

const userListQuerySchema = z.object({
  keyword: z.string().trim().optional(),
  membership_status: z.string().trim().optional(),
  account_status: z.string().trim().optional(),
  registered_start: z.string().trim().optional(),
  registered_end: z.string().trim().optional(),
  active_start: z.string().trim().optional(),
  active_end: z.string().trim().optional(),
  page: z.coerce.number().int().positive().optional(),
  page_size: z.coerce.number().int().positive().optional(),
});

const userIdParamsSchema = z.object({
  userId: z.string().trim().min(1, '用户 ID 不能为空'),
});

const learningRecordsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  page_size: z.coerce.number().int().positive().optional(),
});

const userStatusBodySchema = z.object({
  status: z.string().trim().min(1, '请输入用户状态'),
  reason: z.string().trim().nullable().optional(),
});

const userRemarkBodySchema = z.object({
  content: z.string().trim().min(1, '请输入备注内容'),
});

export const registerAdminUserRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', requireAdminAuth);

  const handleUpdateUserStatus = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = userIdParamsSchema.parse(request.params);
    const body = userStatusBodySchema.parse(request.body ?? {});
    const data = await updateUserStatus(server.db, params.userId, body);
    return sendOk(request, reply, data);
  };

  server.get('/users', { preHandler: requireAdminPermissions('users.view') }, async (request, reply) => {
    const query = userListQuerySchema.parse(request.query ?? {});
    const data = await listUsers(server.db, query);
    return sendList(
      request,
      reply,
      data.list,
      data.pagination.page,
      data.pagination.page_size,
      data.pagination.total,
    );
  });

  server.get('/users/:userId', { preHandler: requireAdminPermissions('users.view') }, async (request, reply) => {
    const params = userIdParamsSchema.parse(request.params);
    const data = await getUserDetail(server.db, params.userId);
    return sendOk(request, reply, data);
  });

  server.get(
    '/users/:userId/learning-records',
    { preHandler: requireAdminPermissions('users.view') },
    async (request, reply) => {
      const params = userIdParamsSchema.parse(request.params);
      const query = learningRecordsQuerySchema.parse(request.query ?? {});
      const data = await getUserLearningRecords(server.db, params.userId, query);
      return sendList(
        request,
        reply,
        data.list,
        data.pagination.page,
        data.pagination.page_size,
        data.pagination.total,
      );
    },
  );

  server.patch('/users/:userId/status', { preHandler: requireAdminPermissions('users.edit') }, handleUpdateUserStatus);
  server.post('/users/:userId/status', { preHandler: requireAdminPermissions('users.edit') }, handleUpdateUserStatus);

  server.post('/users/:userId/remarks', { preHandler: requireAdminPermissions('users.edit') }, async (request, reply) => {
    const params = userIdParamsSchema.parse(request.params);
    const body = userRemarkBodySchema.parse(request.body ?? {});
    const data = await createUserRemark(
      server.db,
      params.userId,
      request.adminAuth!.admin_id,
      body.content,
    );
    return sendOk(request, reply, data);
  });
};
