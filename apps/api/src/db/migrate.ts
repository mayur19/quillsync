import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withTransaction, type Db } from './pool.js';

/**
 * Forward-only SQL migration runner. Files named NNNN_description.sql are applied
 * in lexical order, each in its own transaction, and recorded with a SHA-256
 * checksum; editing an applied file is refused (add a new migration instead).
 */
const MIGRATION_FILE = /^\d{4}_[a-z0-9_]+\.sql$/;

export function defaultMigrationsDir(): string {
  if (process.env.MIGRATIONS_DIR) return process.env.MIGRATIONS_DIR;
  // Walk up from this module (src/db, dist or dist/db) to the package's migrations folder.
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 4; depth += 1) {
    const candidate = path.join(dir, 'migrations');
    if (existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  return path.resolve(process.cwd(), 'migrations');
}

export interface MigrationFile {
  readonly name: string;
  readonly sql: string;
  readonly checksum: string;
}

export async function loadMigrations(dir = defaultMigrationsDir()): Promise<MigrationFile[]> {
  const names = (await readdir(dir)).filter((file) => MIGRATION_FILE.test(file)).sort();
  return Promise.all(
    names.map(async (name) => {
      const sql = await readFile(path.join(dir, name), 'utf8');
      return { name, sql, checksum: createHash('sha256').update(sql).digest('hex') };
    }),
  );
}

export async function runMigrations(db: Db, dir?: string): Promise<string[]> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        text PRIMARY KEY,
      checksum    text NOT NULL,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )`);
  const { rows } = await db.query<{ name: string; checksum: string }>(
    'SELECT name, checksum FROM schema_migrations',
  );
  const applied = new Map(rows.map((row) => [row.name, row.checksum]));
  const newlyApplied: string[] = [];

  for (const migration of await loadMigrations(dir)) {
    const checksum = applied.get(migration.name);
    if (checksum !== undefined) {
      if (checksum !== migration.checksum) {
        throw new Error(`Migration ${migration.name} was modified after being applied`);
      }
      continue;
    }
    await withTransaction(db, async (tx) => {
      await tx.query(migration.sql);
      await tx.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [
        migration.name,
        migration.checksum,
      ]);
    });
    newlyApplied.push(migration.name);
  }
  return newlyApplied;
}

export async function resetSchema(db: Db): Promise<void> {
  await db.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
}
