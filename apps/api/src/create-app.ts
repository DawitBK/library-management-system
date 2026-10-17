import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { applyKit } from '@library/kit';
import type { Logger } from 'pino';
import { AppModule } from './app.module.js';
import type { Env } from './config.js';

export interface AppOptions {
  logger?: Logger;
}

/** Build the application. Shared by `main.ts` and the integration tests. */
export async function createApp(env: Env, options: AppOptions = {}): Promise<INestApplication> {
  const app = await NestFactory.create(
    AppModule.register(env.DATABASE_URL, {
      jwtSecret: env.JWT_SECRET,
      accessTtlSeconds: env.ACCESS_TOKEN_TTL_SECONDS,
      refreshTtlSeconds: env.REFRESH_TOKEN_TTL_SECONDS,
    }),
    { logger: env.NODE_ENV === 'test' ? false : ['error', 'warn'] },
  );
  applyKit(app, options.logger);
  await app.init();
  return app;
}
