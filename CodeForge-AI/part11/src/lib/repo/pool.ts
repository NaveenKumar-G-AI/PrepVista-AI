import { Pool } from "pg";

/**
 * Server-only connection pool (uses DATABASE_URL directly, not the
 * Supabase REST layer). This lets the engine do the multi-table,
 * transactional writes the simulation needs (idempotent action
 * execution, immutable evaluation versioning) with real SQL, while
 * Supabase Auth still owns who the user is (see lib/supabase/server.ts)
 * and Postgres RLS still protects direct/PostgREST/Realtime access to
 * the same tables as defense-in-depth (see db/migrations/0002).
 *
 * Every exported repo function in this directory takes the caller's
 * authenticated userId explicitly and checks ownership in SQL — this
 * pool is privileged, so those checks are load-bearing, not optional.
 */

declare global {
  // eslint-disable-next-line no-var
  var __codeforgePgPool: Pool | undefined;
}

export function getPool(): Pool {
  if (!global.__codeforgePgPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is not set. Copy .env.example to .env.local and fill in your Supabase Postgres connection string."
      );
    }
    global.__codeforgePgPool = new Pool({
      connectionString,
      max: 5,
      ssl: connectionString.includes("localhost") || connectionString.includes("127.0.0.1") ? undefined : { rejectUnauthorized: false },
    });
  }
  return global.__codeforgePgPool;
}

export async function withTransaction<T>(fn: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
