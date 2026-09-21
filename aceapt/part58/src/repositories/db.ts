/**
 * Thin wrapper around a `pg` Pool. Nothing here connects at import time —
 * the pool is created lazily so tests and type-checking never need a real
 * database.
 */
import { Pool, type QueryResultRow } from 'pg';
import { assertDatabaseConfigured, config } from '../config';

let pool: Pool | null = null;

export function getPool(): Pool {
  assertDatabaseConfigured();
  if (!pool) {
    pool = new Pool({ connectionString: config.database.url });
  }
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

export async function withTransaction<T>(fn: (client: import('pg').PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
