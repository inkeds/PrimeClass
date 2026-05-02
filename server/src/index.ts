import 'dotenv/config';

import { buildServer } from './server.js';
import { env } from './common/config/env.js';
import { logger } from './common/utils/logger.js';

async function bootstrap() {
  const server = await buildServer();

  try {
    await server.listen({
      host: env.HOST,
      port: env.PORT,
    });

    logger.info(`Server started on http://${env.HOST}:${env.PORT}`);
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

void bootstrap();
