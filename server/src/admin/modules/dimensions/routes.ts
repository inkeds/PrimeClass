import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { requireAdminAuth, requireAdminPermissions } from '../../../common/auth/admin-auth.js';
import { sendOk } from '../../../common/http/response.js';
import {
  createContentDimension,
  deleteContentDimension,
  listContentDimensions,
  updateContentDimension,
} from './service.js';

const contentDimensionParamsSchema = z.object({
  id: z.string().trim().min(1),
});

const contentDimensionBodySchema = z.object({
  type: z.enum(['version', 'subject', 'grade', 'term']),
  item_code: z.string().trim().min(1, '请输入维度编码'),
  item_name: z.string().trim().min(1, '请输入维度名称'),
  sort_order: z.coerce.number().int().optional(),
  status: z.enum(['enabled', 'disabled']).optional(),
  is_default: z.boolean().optional(),
  home_visible: z.boolean().optional(),
  version_codes: z.array(z.string().trim()).optional(),
  grade_codes: z.array(z.string().trim()).optional(),
  subject_codes: z.array(z.string().trim()).optional(),
});

export const registerAdminContentDimensionRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', requireAdminAuth);

  server.get('/content-dimensions', { preHandler: requireAdminPermissions('courses.view') }, async (request, reply) => {
    const data = await listContentDimensions(server.db);
    return sendOk(request, reply, data);
  });

  server.post('/content-dimensions', { preHandler: requireAdminPermissions('courses.edit') }, async (request, reply) => {
    const body = contentDimensionBodySchema.parse(request.body ?? {});
    const data = await createContentDimension(server.db, body);
    return sendOk(request, reply, data);
  });

  server.post('/content-dimensions/:id', { preHandler: requireAdminPermissions('courses.edit') }, async (request, reply) => {
    const params = contentDimensionParamsSchema.parse(request.params);
    const body = contentDimensionBodySchema.parse(request.body ?? {});
    const data = await updateContentDimension(server.db, params.id, body);
    return sendOk(request, reply, data);
  });

  server.post('/content-dimensions/:id/delete', { preHandler: requireAdminPermissions('courses.edit') }, async (request, reply) => {
    const params = contentDimensionParamsSchema.parse(request.params);
    const data = await deleteContentDimension(server.db, params.id);
    return sendOk(request, reply, data);
  });
};
