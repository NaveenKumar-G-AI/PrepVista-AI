import { Pool, PoolClient } from 'pg';
import { env } from '../config/env';

/**
 * Request-scoped pool. Connects as `aceapt_app`, which owns none of the
 * tables it queries -- this is what makes the RLS policies in
 * 005_rls_policies.sql actually bind (see that file's header comment for the
 * owner-bypass footgun this avoids).
 */
export const appPool = new Pool({
  host: env.db.host,
  port: env.db.port,
  database: env.db.database,
  user: env.db.user,
  password: env.db.password,
  max: 10,
});

/**
 * Worker pool. Connects as `aceapt_worker` (BYPASSRLS). Only ever imported
 * by the offline batch entry point (services run with `--worker`), never by
 * the HTTP request path. See migrations/005 and db/bootstrap-roles.sql.
 */
export const workerPool = new Pool({
  host: env.db.host,
  port: env.db.port,
  database: env.db.database,
  user: env.worker.user,
  password: env.worker.password,
  max: 4,
});

/**
 * Runs `fn` inside a transaction with `app.current_student_id` set via
 * SET LOCAL, so it is automatically scoped to this transaction only and can
 * never leak onto the next request that happens to reuse this pooled
 * connection (a plain `SET` would leak; `SET LOCAL` inside BEGIN/COMMIT does
 * not). This is the ONLY sanctioned way request handlers should touch a
 * student-scoped table.
 */
export async function withStudentContext<T>(
  studentId: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await appPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.current_student_id', studentId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * For queries that are genuinely not student-scoped (public market data:
 * roles, skills, market_snapshots, market_signals, role_evolutions,
 * skill_trends, skill_combinations, technology_signals). No RLS applies to
 * these tables by design (migration 005's footer note), so no session
 * variable is required.
 */
export async function withMarketContext<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await appPool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

/**
 * Worker-side equivalent of withStudentContext. The worker role bypasses RLS
 * outright, but we still set the session variable and still scope every
 * write's WHERE/VALUES to the intended student_id in application code -- the
 * BYPASSRLS grant is a operational-necessity escape hatch, not a license to
 * skip being careful about whose row is being touched.
 */
export async function withWorkerStudentContext<T>(
  studentId: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await workerPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT set_config($1, $2, true)', ['app.current_student_id', studentId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function withWorkerContext<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await workerPool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
