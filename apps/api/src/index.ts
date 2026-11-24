import { buildApp, createLogger } from './app.js';
import { ConfigError, loadConfig } from './config/env.js';
import { createPool } from './db/pool.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger(config);
  const db = createPool(config.DATABASE_URL, config.DB_POOL_MAX);
  const app = await buildApp({ config, db, logger });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    await app.close();
    await db.end();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: config.API_HOST, port: config.API_PORT });
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError) console.error(error.message);
  else console.error('fatal startup error', error);
  process.exit(1);
});
