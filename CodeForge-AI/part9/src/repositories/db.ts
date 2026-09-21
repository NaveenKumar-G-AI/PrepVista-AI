import { Pool, type PoolClient } from 'pg';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

/**
 * PHASE 71 concurrency: wraps a unit of work in a single transaction so
 * "read evidence -> calculate -> write state -> write history" is atomic.
 * Callers that need to serialize concurrent recalculation for the same
 * (student, skill) should take a row lock inside `work` via
 * `SELECT ... FOR UPDATE` on student_skill_state.
 */
export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
