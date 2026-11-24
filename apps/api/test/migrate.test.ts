import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadMigrations, runMigrations } from '../src/db/migrate.js';
import { createPool, type Db } from '../src/db/pool.js';
import { TEST_DATABASE_URL, assertTestDatabase } from './db-url.js';

let db: Db;
beforeAll(() => {
  db = createPool(TEST_DATABASE_URL, 2);
});
afterAll(async () => db.end());

describe('migration runner', () => {
  it('loads migrations in order and is a no-op when up to date', async () => {
    const files = await loadMigrations();
    expect(files.map((f) => f.name)).toEqual(['0001_foundation.sql', '0002_documents_op_log.sql']);
    expect(await runMigrations(db)).toEqual([]);
  });

  it('refuses edited migrations', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'qs-migrations-'));
    await writeFile(path.join(dir, '0001_foundation.sql'), 'SELECT 1; -- edited');
    await expect(runMigrations(db, dir)).rejects.toThrow(/modified after being applied/);
  });

  it('applies a new migration inside a transaction', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'qs-migrations-'));
    for (const file of await loadMigrations()) await writeFile(path.join(dir, file.name), file.sql);
    await writeFile(
      path.join(dir, '0099_broken.sql'),
      'CREATE TABLE qs_tmp (id int); SELECT broken_function();',
    );
    await expect(runMigrations(db, dir)).rejects.toThrow();
    const table = await db.query("SELECT to_regclass('public.qs_tmp') AS t");
    expect(table.rows[0].t).toBeNull();
  });

  it('guards against non-test databases', () => {
    expect(() => assertTestDatabase('postgres:///quillsync_dev?host=/tmp')).toThrow(/_test/);
    expect(assertTestDatabase('postgres:///quillsync_test?host=/tmp').name).toBe('quillsync_test');
  });
});
