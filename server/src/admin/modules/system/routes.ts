import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { requireAdminAuth, requireAdminPermissions } from '../../../common/auth/admin-auth.js';
import { sendList, sendOk } from '../../../common/http/response.js';
import {
  createSystemNotification,
  createDictionaryItem,
  deleteDictionaryItem,
  ensureStorageProvider,
  getDashboardOverview,
  getDashboardTodos,
  listDictionaries,
  listSystemNotifications,
  getSettingsByCategory,
  getStorageSettings,
  testStorageConfig,
  updateSystemNotification,
  updateDictionaryItem,
  updateSettingsByCategory,
  updateStorageSettings,
} from './service.js';

const settingsBodySchema = z.union([z.record(z.unknown()), z.object({ settings: z.record(z.unknown()) })]);

const storageSettingsBodySchema = z.object({
  default_provider: z.enum(['local', 's3', 'tencent_cos', 'ftp']).optional(),
  providers: z
    .object({
      local: z.object({ is_enabled: z.boolean().optional(), config: z.record(z.unknown()).optional() }).optional(),
      s3: z.object({ is_enabled: z.boolean().optional(), config: z.record(z.unknown()).optional() }).optional(),
      tencent_cos: z
        .object({ is_enabled: z.boolean().optional(), config: z.record(z.unknown()).optional() })
        .optional(),
      ftp: z.object({ is_enabled: z.boolean().optional(), config: z.record(z.unknown()).optional() }).optional(),
    })
    .default({}),
});

const storageTestBodySchema = z.object({
  provider: z.enum(['local', 's3', 'tencent_cos', 'ftp']),
  config: z.record(z.unknown()).optional(),
});

const notificationBodySchema = z.object({
  title: z.string().trim().min(1, '请输入通知标题').max(120, '通知标题不能超过 120 个字符'),
  content: z.string().trim().min(1, '请输入通知内容').max(1000, '通知内容不能超过 1000 个字符'),
  tone: z.enum(['info', 'warning', 'success', 'vip']).default('info'),
  status: z.enum(['draft', 'published', 'disabled']).default('published'),
});

const dictionaryQuerySchema = z.object({
  type: z.string().trim().optional(),
  status: z.string().trim().optional(),
  scope: z.enum(['all', 'general']).optional(),
});

const dictionaryBodySchema = z.object({
  type: z.string().trim().min(1, '请输入字典类型编码'),
  type_name: z.string().trim().optional(),
  type_status: z.enum(['enabled', 'disabled']).optional(),
  type_remark: z.string().trim().nullable().optional(),
  item_code: z.string().trim().min(1, '请输入字典项编码'),
  item_name: z.string().trim().min(1, '请输入字典项名称'),
  parent_id: z.string().trim().nullable().optional(),
  sort_order: z.coerce.number().int().optional(),
  status: z.enum(['enabled', 'disabled']).optional(),
  extra: z.record(z.unknown()).nullable().optional(),
});

const dictionaryUpdateBodySchema = dictionaryBodySchema.partial({
  type: true,
  type_name: true,
  type_status: true,
  type_remark: true,
  parent_id: true,
  sort_order: true,
  status: true,
  extra: true,
}).extend({
  item_code: z.string().trim().min(1, '请输入字典项编码'),
  item_name: z.string().trim().min(1, '请输入字典项名称'),
});

const dictionaryIdParamsSchema = z.object({
  id: z.string().trim().min(1),
});

export const registerAdminSystemRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', requireAdminAuth);

  const saveCategorySettings = (category: 'basic' | 'display' | 'upload') =>
    async (request: FastifyRequest, reply: FastifyReply) => {
      const payload = parseSettingsBody(request.body);
      const data = await updateSettingsByCategory(
        server.db,
        category,
        payload,
        request.adminAuth!.admin_id,
      );
      return sendOk(request, reply, data);
    };

  server.get('/dashboard/overview', { preHandler: requireAdminPermissions('dashboard.view') }, async (request, reply) => {
    const data = await getDashboardOverview(server.db);
    return sendOk(request, reply, data);
  });

  server.get('/dashboard/todos', { preHandler: requireAdminPermissions('dashboard.view') }, async (request, reply) => {
    const list = await getDashboardTodos(server.db);
    return sendList(request, reply, list, 1, list.length || 20, list.length);
  });

  server.get('/settings/basic', { preHandler: requireAdminPermissions('system.view') }, async (request, reply) => {
    const data = await getSettingsByCategory(server.db, 'basic');
    return sendOk(request, reply, data);
  });

  server.put('/settings/basic', { preHandler: requireAdminPermissions('system.edit') }, saveCategorySettings('basic'));
  server.post('/settings/basic', { preHandler: requireAdminPermissions('system.edit') }, saveCategorySettings('basic'));

  server.get('/settings/display', { preHandler: requireAdminPermissions('system.view') }, async (request, reply) => {
    const data = await getSettingsByCategory(server.db, 'display');
    return sendOk(request, reply, data);
  });

  server.put('/settings/display', { preHandler: requireAdminPermissions('system.edit') }, saveCategorySettings('display'));
  server.post('/settings/display', { preHandler: requireAdminPermissions('system.edit') }, saveCategorySettings('display'));

  server.get('/settings/upload', { preHandler: requireAdminPermissions('system.view') }, async (request, reply) => {
    const data = await getSettingsByCategory(server.db, 'upload');
    return sendOk(request, reply, data);
  });

  server.put('/settings/upload', { preHandler: requireAdminPermissions('system.edit') }, saveCategorySettings('upload'));
  server.post('/settings/upload', { preHandler: requireAdminPermissions('system.edit') }, saveCategorySettings('upload'));

  server.get('/settings/storage', { preHandler: requireAdminPermissions('system.view') }, async (request, reply) => {
    const data = await getStorageSettings(server.db);
    return sendOk(request, reply, data);
  });

  const saveStorageSettings = async (request: FastifyRequest, reply: FastifyReply) => {
    const body = storageSettingsBodySchema.parse(request.body ?? {});
    const data = await updateStorageSettings(
      server.db,
      {
        default_provider: body.default_provider,
        providers: body.providers,
      },
      request.adminAuth!.admin_id,
    );
    return sendOk(request, reply, data);
  };

  const handleUpdateNotification = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = dictionaryIdParamsSchema.parse(request.params);
    const body = notificationBodySchema.parse(request.body ?? {});
    const list = await updateSystemNotification(
      server.db,
      params.id,
      {
        title: body.title,
        content: body.content,
        tone: body.tone,
        status: body.status,
      },
      request.adminAuth!.admin_id,
    );

    return sendList(request, reply, list, 1, list.length || 20, list.length);
  };

  const handleUpdateDictionary = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = dictionaryIdParamsSchema.parse(request.params);
    const body = dictionaryUpdateBodySchema.parse(request.body ?? {});
    const data = await updateDictionaryItem(server.db, params.id, {
      type: body.type,
      type_name: body.type_name,
      type_status: body.type_status,
      type_remark: body.type_remark,
      item_code: body.item_code,
      item_name: body.item_name,
      parent_id: body.parent_id,
      sort_order: body.sort_order,
      status: body.status,
      extra: body.extra,
    });
    return sendOk(request, reply, data);
  };

  const handleDeleteDictionary = async (request: FastifyRequest, reply: FastifyReply) => {
    const params = dictionaryIdParamsSchema.parse(request.params);
    const data = await deleteDictionaryItem(server.db, params.id);
    return sendOk(request, reply, data);
  };

  server.put('/settings/storage', { preHandler: requireAdminPermissions('system.edit') }, saveStorageSettings);
  server.post('/settings/storage', { preHandler: requireAdminPermissions('system.edit') }, saveStorageSettings);

  server.post('/settings/storage/test', { preHandler: requireAdminPermissions('system.edit') }, async (request, reply) => {
    const body = storageTestBodySchema.parse(request.body ?? {});
    const data = await testStorageConfig(
      server.db,
      {
        provider: ensureStorageProvider(body.provider),
        config: body.config,
      },
      request.adminAuth!.admin_id,
    );
    return sendOk(request, reply, data);
  });

  server.get('/settings/notifications', { preHandler: requireAdminPermissions('system.view') }, async (request, reply) => {
    const list = await listSystemNotifications(server.db);
    return sendList(request, reply, list, 1, list.length || 20, list.length);
  });

  server.post('/settings/notifications', { preHandler: requireAdminPermissions('system.edit') }, async (request, reply) => {
    const body = notificationBodySchema.parse(request.body ?? {});
    const list = await createSystemNotification(
      server.db,
      {
        title: body.title,
        content: body.content,
        tone: body.tone,
        status: body.status,
      },
      request.adminAuth!.admin_id,
    );

    return sendList(request, reply, list, 1, list.length || 20, list.length);
  });

  server.put('/settings/notifications/:id', { preHandler: requireAdminPermissions('system.edit') }, handleUpdateNotification);
  server.post('/settings/notifications/:id', { preHandler: requireAdminPermissions('system.edit') }, handleUpdateNotification);

  server.get('/dictionaries', { preHandler: requireAdminPermissions('system.view') }, async (request, reply) => {
    const query = dictionaryQuerySchema.parse(request.query ?? {});
    const list = await listDictionaries(server.db, query);
    return sendList(request, reply, list, 1, list.length || 20, list.length);
  });

  server.post('/dictionaries', { preHandler: requireAdminPermissions('system.edit') }, async (request, reply) => {
    const body = dictionaryBodySchema.parse(request.body ?? {});
    const data = await createDictionaryItem(server.db, {
      type: body.type,
      type_name: body.type_name,
      type_status: body.type_status,
      type_remark: body.type_remark,
      item_code: body.item_code,
      item_name: body.item_name,
      parent_id: body.parent_id,
      sort_order: body.sort_order,
      status: body.status,
      extra: body.extra,
    });
    return sendOk(request, reply, data);
  });

  server.put('/dictionaries/:id', { preHandler: requireAdminPermissions('system.edit') }, handleUpdateDictionary);
  server.post('/dictionaries/:id', { preHandler: requireAdminPermissions('system.edit') }, handleUpdateDictionary);

  server.delete('/dictionaries/:id', { preHandler: requireAdminPermissions('system.edit') }, handleDeleteDictionary);
  server.post('/dictionaries/:id/delete', { preHandler: requireAdminPermissions('system.edit') }, handleDeleteDictionary);
};

function parseSettingsBody(body: unknown) {
  const parsed = settingsBodySchema.parse(body ?? {});
  const settings = 'settings' in parsed ? parsed.settings : parsed;
  return settings as Record<string, unknown>;
}
