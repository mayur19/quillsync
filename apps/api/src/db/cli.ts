import pino from 'pino';
import { loadConfig } from '../config/env.js';
import { runMigrations, resetSchema } from './migrate.js';
import { createPool } from './pool.js';
import { seedDemoData } from './seed.js';

const USAGE = 'usage: cli.ts <migrate|seed|reset>';

async function main(): Promise<void> {
  const command = process.argv[2];
  if (!command || !['migrate', 'seed', 'reset'].includes(command)) {
    console.error(USAGE);
    process.exit(2);
  }
  const config = loadConfig();
  const logger = pino({ level: config.LOG_LEVEL });
  const db = createPool(config.DATABASE_URL, 2);
  try {
    if (command === 'reset') {
      if (config.NODE_ENV === 'production')
        throw new Error('Refusing to reset a production database');
      await resetSchema(db);
      logger.info('schema dropped');
    }
    if (command === 'migrate' || command === 'reset') {
      const applied = await runMigrations(db);
      logger.info({ applied }, applied.length ? 'migrations applied' : 'schema up to date');
    }
    if (command === 'seed' || command === 'reset') {
      const summary = await seedDemoData(db);
      logger.info(summary, 'demo data seeded');
    }
  } finally {
    await db.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
