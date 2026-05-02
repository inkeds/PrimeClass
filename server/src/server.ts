import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { registerAdminRoutes } from './admin/routes.js';
import { registerAppRoutes } from './app/routes.js';
import { env } from './common/config/env.js';
import { getMySqlPool, verifyMySqlConnection } from './common/db/mysql.js';
import { AppError } from './common/errors/app-error.js';
import { sendError, sendOk } from './common/http/response.js';

export async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: false,
  });

  await server.register(cors, {
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',').map((item) => item.trim()),
  });

  await server.register(multipart, {
    limits: {
      files: 1,
      fields: 20,
      fileSize: 1024 * 1024 * 1024,
    },
  });

  server.decorate('db', getMySqlPool());

  if (!env.SKIP_DB_CHECK) {
    await verifyMySqlConnection();
  }

  server.get('/health', async (request, reply) =>
    sendOk(request, reply, {
      app_name: env.APP_NAME,
      environment: env.NODE_ENV,
      db_check: env.SKIP_DB_CHECK ? 'skipped' : 'connected',
      uptime_seconds: Math.floor(process.uptime()),
    }),
  );

  await server.register(registerAdminRoutes);
  await server.register(registerAppRoutes);

  server.setNotFoundHandler(async (request, reply) =>
    sendError(request, reply, {
      httpStatus: 404,
      code: 40400,
      message: 'Route not found',
    }),
  );

  server.setErrorHandler(async (error, request, reply) => {
    if (error instanceof AppError) {
      return sendError(request, reply, {
        httpStatus: error.httpStatus,
        code: error.code,
        message: error.message,
        data: error.data,
      });
    }

    if (error instanceof ZodError) {
      return sendError(request, reply, {
        httpStatus: 400,
        code: 40001,
        message: error.issues[0]?.message ?? 'Invalid request parameters',
        data: error.flatten(),
      });
    }

    const typedError = error as Error & { statusCode?: number };
    const httpStatus = typedError.statusCode ?? 500;

    return sendError(request, reply, {
      httpStatus,
      code: httpStatus < 500 ? 40001 : 50000,
      message: typedError.message || 'Internal server error',
    });
  });

  server.addHook('onClose', async (instance) => {
    await instance.db.end();
  });

  return server;
}
