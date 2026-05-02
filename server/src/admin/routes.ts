import type { FastifyPluginAsync } from 'fastify';

import { ADMIN_API_PREFIX } from '../common/config/constants.js';
import { registerAdminAuthRoutes } from './modules/auth/routes.js';
import { registerAdminCourseRoutes } from './modules/courses/routes.js';
import { registerAdminContentDimensionRoutes } from './modules/dimensions/routes.js';
import { registerAdminMembershipRoutes } from './modules/memberships/routes.js';
import { registerAdminSystemRoutes } from './modules/system/routes.js';
import { registerAdminUserRoutes } from './modules/users/routes.js';

export const registerAdminRoutes: FastifyPluginAsync = async (server) => {
  await server.register(
    async (app) => {
      await app.register(registerAdminAuthRoutes);
      await app.register(registerAdminUserRoutes);
      await app.register(registerAdminCourseRoutes);
      await app.register(registerAdminContentDimensionRoutes);
      await app.register(registerAdminMembershipRoutes);
      await app.register(registerAdminSystemRoutes);
    },
    { prefix: ADMIN_API_PREFIX },
  );
};
