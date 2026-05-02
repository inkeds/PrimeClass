import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { requireAdminAuth, requireAdminPermissions } from '../../../common/auth/admin-auth.js';
import { sendList, sendOk } from '../../../common/http/response.js';
import {
  compensateMembership,
  createActivationCodeBatch,
  createMembershipPackage,
  exportActivationCodesByBatch,
  invalidateActivationCode,
  listActivationCodeBatches,
  listActivationCodes,
  listActivationRedeemLogs,
  listMembershipPackages,
  updateMembershipPackage,
} from './service.js';

const membershipPackageQuerySchema = z.object({
  keyword: z.string().trim().optional(),
  status: z.string().trim().optional(),
  page: z.coerce.number().int().positive().optional(),
  page_size: z.coerce.number().int().positive().optional(),
});

const membershipPackageBodySchema = z.object({
  package_name: z.string().trim().min(1, '请输入套餐名称'),
  package_type: z.string().trim().min(1, '请输入套餐类型'),
  package_tone: z.enum(['blue', 'green', 'gold', 'red', 'slate', 'violet']).nullable().optional(),
  duration_days: z.coerce.number().int().nonnegative().nullable().optional(),
  is_permanent: z.boolean().optional(),
  rights_desc: z.string().trim().nullable().optional(),
  status: z.string().trim().optional(),
  sort_order: z.coerce.number().int().optional(),
});

const activationBatchQuerySchema = z.object({
  keyword: z.string().trim().optional(),
  status: z.string().trim().optional(),
  page: z.coerce.number().int().positive().optional(),
  page_size: z.coerce.number().int().positive().optional(),
});

const activationBatchBodySchema = z.object({
  package_id: z.string().trim().min(1, '请选择会员套餐'),
  quantity: z.coerce.number().int().positive(),
  expired_at: z.string().trim().nullable().optional(),
  source_channel: z.string().trim().nullable().optional(),
  remark: z.string().trim().nullable().optional(),
});

const activationCodeQuerySchema = z.object({
  batch_no: z.string().trim().optional(),
  code: z.string().trim().optional(),
  status: z.string().trim().optional(),
  user_id: z.string().trim().optional(),
  expired_start: z.string().trim().optional(),
  expired_end: z.string().trim().optional(),
  page: z.coerce.number().int().positive().optional(),
  page_size: z.coerce.number().int().positive().optional(),
});

const activationCodeInvalidateBodySchema = z.object({
  reason: z.string().trim().min(1, '请输入作废原因'),
});

const activationRedeemLogQuerySchema = z.object({
  result_status: z.string().trim().optional(),
  user_id: z.string().trim().optional(),
  batch_no: z.string().trim().optional(),
  page: z.coerce.number().int().positive().optional(),
  page_size: z.coerce.number().int().positive().optional(),
});

const compensationBodySchema = z.object({
  user_id: z.string().trim().min(1, '请选择补偿用户'),
  days: z.coerce.number().int().nonnegative().nullable().optional(),
  is_permanent: z.boolean().optional(),
  reason: z.string().trim().min(1, '请输入补偿原因'),
  package_id: z.string().trim().nullable().optional(),
});

export const registerAdminMembershipRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', requireAdminAuth);

  const handleUpdateMembershipPackage = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = z.object({ packageId: z.string().trim().min(1) }).parse(request.params);
    const body = membershipPackageBodySchema.parse(request.body ?? {});
    const data = await updateMembershipPackage(server.db, params.packageId, body);
    return sendOk(request, reply, data);
  };

  server.get('/membership/packages', { preHandler: requireAdminPermissions('membership.view') }, async (request, reply) => {
    const query = membershipPackageQuerySchema.parse(request.query ?? {});
    const data = await listMembershipPackages(server.db, query);
    return sendList(
      request,
      reply,
      data.list,
      data.pagination.page,
      data.pagination.page_size,
      data.pagination.total,
    );
  });

  server.post('/membership/packages', { preHandler: requireAdminPermissions('membership.edit') }, async (request, reply) => {
    const body = membershipPackageBodySchema.parse(request.body ?? {});
    const data = await createMembershipPackage(server.db, body);
    return sendOk(request, reply, data);
  });

  server.put('/membership/packages/:packageId', { preHandler: requireAdminPermissions('membership.edit') }, handleUpdateMembershipPackage);
  server.post('/membership/packages/:packageId', { preHandler: requireAdminPermissions('membership.edit') }, handleUpdateMembershipPackage);

  server.get('/membership/code-batches', { preHandler: requireAdminPermissions('membership.view') }, async (request, reply) => {
    const query = activationBatchQuerySchema.parse(request.query ?? {});
    const data = await listActivationCodeBatches(server.db, query);
    return sendList(
      request,
      reply,
      data.list,
      data.pagination.page,
      data.pagination.page_size,
      data.pagination.total,
    );
  });

  server.post('/membership/code-batches', { preHandler: requireAdminPermissions('membership.edit') }, async (request, reply) => {
    const body = activationBatchBodySchema.parse(request.body ?? {});
    const data = await createActivationCodeBatch(server.db, body, request.adminAuth!.admin_id);
    return sendOk(request, reply, data);
  });

  server.get('/membership/codes', { preHandler: requireAdminPermissions('membership.view') }, async (request, reply) => {
    const query = activationCodeQuerySchema.parse(request.query ?? {});
    const data = await listActivationCodes(server.db, query);
    return sendList(
      request,
      reply,
      data.list,
      data.pagination.page,
      data.pagination.page_size,
      data.pagination.total,
    );
  });

  server.post(
    '/membership/codes/:codeId/invalidate',
    { preHandler: requireAdminPermissions('membership.edit') },
    async (request, reply) => {
      const params = z.object({ codeId: z.string().trim().min(1) }).parse(request.params);
      const body = activationCodeInvalidateBodySchema.parse(request.body ?? {});
      const data = await invalidateActivationCode(server.db, params.codeId, body.reason);
      return sendOk(request, reply, data);
    },
  );

  server.get(
    '/membership/code-batches/:batchNo/export',
    { preHandler: requireAdminPermissions('membership.edit') },
    async (request, reply) => {
      const params = z.object({ batchNo: z.string().trim().min(1) }).parse(request.params);
      const data = await exportActivationCodesByBatch(server.db, params.batchNo);
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${data.filename}"`)
        .send(data.content);
    },
  );

  server.get('/membership/redeem-logs', { preHandler: requireAdminPermissions('membership.view') }, async (request, reply) => {
    const query = activationRedeemLogQuerySchema.parse(request.query ?? {});
    const data = await listActivationRedeemLogs(server.db, query);
    return sendList(
      request,
      reply,
      data.list,
      data.pagination.page,
      data.pagination.page_size,
      data.pagination.total,
    );
  });

  server.post('/membership/compensations', { preHandler: requireAdminPermissions('membership.edit') }, async (request, reply) => {
    const body = compensationBodySchema.parse(request.body ?? {});
    const data = await compensateMembership(server.db, body, request.adminAuth!.admin_id);
    return sendOk(request, reply, data);
  });
};
