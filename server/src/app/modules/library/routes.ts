import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { requireAppAuth } from '../../../common/auth/app-auth.js';
import { sendList, sendOk } from '../../../common/http/response.js';
import { getLibraryOverview, listContinueLearning, listHistoryRecords } from './service.js';

const libraryQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  page_size: z.coerce.number().int().positive().optional(),
});

export const registerAppLibraryRoutes: FastifyPluginAsync = async (server) => {
  server.addHook('preHandler', requireAppAuth);

  server.get('/library', async (request, reply) => {
    const data = await getLibraryOverview(server.db, request.userAuth!.user_id);
    return sendOk(request, reply, data);
  });

  server.get('/library/continue-learning', async (request, reply) => {
    const query = libraryQuerySchema.parse(request.query ?? {});
    const data = await listContinueLearning(server.db, request.userAuth!.user_id, query);
    return sendList(
      request,
      reply,
      data.list,
      data.pagination.page,
      data.pagination.page_size,
      data.pagination.total,
    );
  });

  server.get('/library/history', async (request, reply) => {
    const query = libraryQuerySchema.parse(request.query ?? {});
    const data = await listHistoryRecords(server.db, request.userAuth!.user_id, query);
    return sendList(
      request,
      reply,
      data.list,
      data.pagination.page,
      data.pagination.page_size,
      data.pagination.total,
    );
  });
};
