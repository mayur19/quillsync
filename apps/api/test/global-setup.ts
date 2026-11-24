import pg from 'pg';
import { resetSchema, runMigrations } from '../src/db/migrate.js';
import { createPool } from '../src/db/pool.js';
import { assertTestDatabase, TEST_DATABASE_URL } from './db-url.js';

export default async function setup(): Promise<void> {
  const { adminUrl, name } = assertTestDatabase(TEST_DATABASE_URL);
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
  if (exists.rowCount === 0) await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();

  const db = createPool(TEST_DATABASE_URL, 2);
  await resetSchema(db);
  await runMigrations(db);
  await db.end();
}
