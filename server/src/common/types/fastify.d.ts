import type { Pool } from 'mysql2/promise';
import type { AdminAuthContext, AppAuthContext } from '../auth/types.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Pool;
  }

  interface FastifyRequest {
    adminAuth?: AdminAuthContext;
    userAuth?: AppAuthContext;
  }
}

export {};
