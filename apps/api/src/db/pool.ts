import pg from 'pg';

export type Db = pg.Pool;
export type Queryable = Pick<pg.Pool | pg.PoolClient, 'query'>;

export function createPool(connectionString: string, max = 10): Db {
  const pool = new pg.Pool({ connectionString, max, idleTimeoutMillis: 30_000 });
  // An idle client error must not crash the process; the next query reconnects.
  pool.on('error', (error) => console.error('postgres pool error', error.message));
  return pool;
}

export async function withTransaction<T>(
  db: Db,
  work: (tx: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
