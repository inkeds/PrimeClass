import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { tryGetAppAuthContext } from '../../../common/auth/app-auth.js';
import { sendOk } from '../../../common/http/response.js';
import { getDisplaySettings, getGradeList, getHomeData, getSubjectList, getVersionList } from './service.js';

const versionQuerySchema = z.object({
  grade: z.string().trim().optional(),
  subject: z.string().trim().optional(),
});

const subjectQuerySchema = z.object({
  version: z.string().trim().optional(),
});

const gradeQuerySchema = z.object({
  subject: z.string().trim().optional(),
  version: z.string().trim().optional(),
});

export const registerAppHomeRoutes: FastifyPluginAsync = async (server) => {
  server.get('/home', async (request, reply) => {
    const user = await tryGetAppAuthContext(request);
    const data = await getHomeData(server.db, user?.user_id);
    return sendOk(request, reply, data);
  });

  server.get('/versions', async (request, reply) => {
    const query = versionQuerySchema.parse(request.query ?? {});
    const data = await getVersionList(server.db, query);
    return sendOk(request, reply, data);
  });

  server.get('/subjects', async (request, reply) => {
    const query = subjectQuerySchema.parse(request.query ?? {});
    const data = await getSubjectList(server.db, query);
    return sendOk(request, reply, data);
  });

  server.get('/grades', async (request, reply) => {
    const query = gradeQuerySchema.parse(request.query ?? {});
    const data = await getGradeList(server.db, query);
    return sendOk(request, reply, data);
  });

  server.get('/settings/display', async (request, reply) => {
    const data = await getDisplaySettings(server.db);
    return sendOk(request, reply, data);
  });
};
