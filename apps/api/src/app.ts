import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import type { Logger } from 'pino';
import type { ApiEnvironment } from './config.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { requestLoggerMiddleware } from './middleware/request-logger.js';
import { healthRouter } from './routes/health.js';
import { authRouter } from './routes/auth.js';
import { onboardingRouter } from './routes/onboarding.js';
import { importsRouter } from './routes/imports.js';

export interface AppDependencies {
  config: ApiEnvironment;
  logger: Logger;
}

export function createApp({ config, logger }: AppDependencies) {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.CORS_ORIGIN }));
  app.use(requestIdMiddleware);
  app.use(requestLoggerMiddleware(logger));
  app.use(express.json({ limit: '1mb' }));
  app.use('/health', healthRouter);
  app.use('/auth', authRouter(logger));
  app.use('/onboarding', onboardingRouter(logger));
  app.use('/imports', importsRouter(logger));
  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
