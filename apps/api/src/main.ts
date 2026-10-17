import 'reflect-metadata';
import { createLogger, parseEnv } from '@library/kit';
import { envSchema } from './config.js';
import { createApp } from './create-app.js';

const env = parseEnv(envSchema);
const logger = createLogger({ name: 'library-api', level: env.LOG_LEVEL });
const app = await createApp(env, { logger });
app.enableShutdownHooks();
await app.listen(env.PORT, '0.0.0.0');
logger.info({ port: env.PORT }, 'library-api listening');
