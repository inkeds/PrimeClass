import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { requireAppAuth } from '../../../common/auth/app-auth.js';
import { sendOk } from '../../../common/http/response.js';
import { getCurrentMembership, redeemActivationCode } from './service.js';

const membershipRedeemBodySchema = z.object({
  code: z.string().trim().min(1, '请输入激活码'),
});

export const registerAppMembershipRoutes: FastifyPluginAsync = async (server) => {
  server.get('/membership', { preHandler: requireAppAuth }, async (request, reply) => {
    const data = await getCurrentMembership(server.db, request.userAuth!.user_id);
    return sendOk(request, reply, data);
  });

  server.post('/membership/redeem', { preHandler: requireAppAuth }, async (request, reply) => {
    const body = membershipRedeemBodySchema.parse(request.body ?? {});
    const requestId =
      typeof request.headers['idempotency-key'] === 'string'
        ? request.headers['idempotency-key']
        : null;

    const data = await redeemActivationCode(server.db, {
      userId: request.userAuth!.user_id,
      code: body.code,
      requestId,
    });

    return sendOk(request, reply, data);
  });
};
