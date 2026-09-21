import { Pool, PoolClient } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

function buildConnectionConfig() {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL };
  }
  return {
    host: process.env.PGHOST,
    port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
  };
}

export const pool = new Pool(buildConnectionConfig());

export type ActorRole = 'student' | 'tpo' | 'trainer' | 'service';

export interface RequestContext {
  studentId: string | null;
  role: ActorRole;
}

/**
 * Runs `fn` inside a transaction with RLS context set for its duration only.
 *
 * Two things had to be verified against a real Postgres instance while
 * building this, both of which would otherwise fail silently or not at all:
 *
 *  1. `SET LOCAL x = $1` does not accept bound parameters — Postgres
 *     rejects it with a syntax error. `select set_config(name, value,
 *     is_local)` is a normal function call and takes parameters properly;
 *     `is_local = true` gives the exact same transaction-scoped reset
 *     behaviour as `SET LOCAL`.
 *  2. On a pooled connection, that reset genuinely happens at COMMIT —
 *     confirmed by reading the setting back on the same client after
 *     commit and seeing it empty. Using a plain (non-local) SET here
 *     instead would leak one student's context onto the next request that
 *     happens to reuse this connection — never change is_local to false.
 */
export async function withRequestContext<T>(
  ctx: RequestContext,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.actor_role', $1, true)", [ctx.role]);
    await client.query("SELECT set_config('app.current_student_id', $1, true)", [ctx.studentId ?? '']);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {
      /* connection may already be broken; nothing more we can do here */
    });
    throw err;
  } finally {
    client.release();
  }
}

/** Convenience for simple single-query handlers. */
export async function queryAsStudent<T = unknown>(
  studentId: string,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return withRequestContext({ studentId, role: 'student' }, async (client) => {
    const result = await client.query(sql, params);
    return result.rows as T[];
  });
}

export async function queryAsService<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
  return withRequestContext({ studentId: null, role: 'service' }, async (client) => {
    const result = await client.query(sql, params);
    return result.rows as T[];
  });
}
