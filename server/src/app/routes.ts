import type { FastifyPluginAsync } from 'fastify';

import { APP_API_PREFIX } from '../common/config/constants.js';
import { registerAppCourseRoutes } from './modules/courses/routes.js';
import { registerAppHomeRoutes } from './modules/home/routes.js';
import { registerAppLibraryRoutes } from './modules/library/routes.js';
import { registerAppMeRoutes } from './modules/me/routes.js';
import { registerAppMembershipRoutes } from './modules/membership/routes.js';

export const registerAppRoutes: FastifyPluginAsync = async (server) => {
  await server.register(
    async (app) => {
      await app.register(registerAppHomeRoutes);
      await app.register(registerAppMeRoutes);
      await app.register(registerAppCourseRoutes);
      await app.register(registerAppLibraryRoutes);
      await app.register(registerAppMembershipRoutes);
    },
    { prefix: APP_API_PREFIX },
  );
};
