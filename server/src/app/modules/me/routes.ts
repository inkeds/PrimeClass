import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { requireAppAuth } from '../../../common/auth/app-auth.js';
import { sendOk } from '../../../common/http/response.js';
import {
  getCurrentUserInfo,
  loginAppUser,
  logoutAppUser,
  updateCurrentUserEmail,
  updateCurrentUserNotifications,
} from './service.js';

const appLoginBodySchema = z.object({
  login_type: z.enum(['password', 'sms', 'guest_upgrade']).optional(),
  account: z.string().trim().optional(),
  password: z.string().optional(),
  sms_code: z.string().trim().optional(),
});

const accountEmailBodySchema = z.object({
  email: z
    .union([z.string().trim().email('请输入正确邮箱地址'), z.literal(''), z.null()])
    .transform((value) => {
      if (!value) {
        return null;
      }

      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }),
});

const notificationSettingsBodySchema = z.object({
  email_course_update: z.boolean().optional(),
  email_membership_expiry: z.boolean().optional(),
  email_system_notice: z.boolean().optional(),
  in_app_system_notice: z.boolean().optional(),
});

export const registerAppMeRoutes: FastifyPluginAsync = async (server) => {
  server.post('/auth/login', async (request, reply) => {
    const body = appLoginBodySchema.parse(request.body ?? {});
    const data = await loginAppUser(server.db, {
      login_type: body.login_type,
      account: body.account,
      password: body.password,
      sms_code: body.sms_code,
      loginIp: request.ip,
    });

    return sendOk(request, reply, data);
  });

  server.post('/auth/logout', { preHandler: requireAppAuth }, async (request, reply) =>
    sendOk(request, reply, await logoutAppUser(server.db, request.userAuth!.user_id)),
  );

  server.get('/me', { preHandler: requireAppAuth }, async (request, reply) => {
    const data = await getCurrentUserInfo(server.db, request.userAuth!.user_id);
    return sendOk(request, reply, data);
  });

  server.post('/me/account/email', { preHandler: requireAppAuth }, async (request, reply) => {
    const body = accountEmailBodySchema.parse(request.body ?? {});
    const data = await updateCurrentUserEmail(server.db, request.userAuth!.user_id, body.email);
    return sendOk(request, reply, data);
  });

  server.post('/me/notifications', { preHandler: requireAppAuth }, async (request, reply) => {
    const body = notificationSettingsBodySchema.parse(request.body ?? {});
    const data = await updateCurrentUserNotifications(server.db, request.userAuth!.user_id, body);
    return sendOk(request, reply, data);
  });
};
