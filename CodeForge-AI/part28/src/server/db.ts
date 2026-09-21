import pg from "pg";
import type { PostgresRepositoryDeps } from "../lib/growth/persistence/postgresRepository.ts";

/**
 * Two separate pools on purpose:
 *  - `servicePool` connects as a privileged role (Supabase `service_role`
 *    equivalent) that bypasses RLS. Used only inside the repository for
 *    writes and the instructor-authorization lookup.
 *  - `authenticatedPool` connects as the `authenticated` role, RLS
 *    enforced. Every query issued against it runs inside a transaction
 *    that first sets the session's auth claim, so Postgres itself — not
 *    just application code — decides what rows come back.
 *
 * Connection strings are read from env and intentionally left unset here;
 * fill in DATABASE_URL / DATABASE_SERVICE_URL in your own .env.
 */
const servicePool = new pg.Pool({ connectionString: process.env.DATABASE_SERVICE_URL });
const authenticatedPool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export const serviceQuery: PostgresRepositoryDeps["serviceQuery"] = async (sql, params) => {
  const result = await servicePool.query(sql, params as unknown[]);
  return result.rows;
};

/**
 * Runs `sql` as the given authenticated user. Uses `SET LOCAL` inside an
 * explicit transaction so the claim never leaks onto a pooled connection
 * for a different request afterward.
 */
export function authenticatedQueryFor(userId: string): PostgresRepositoryDeps["authenticatedQuery"] {
  return async (sql, params) => {
    const client = await authenticatedPool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
      await client.query("set local role authenticated");
      const result = await client.query(sql, params as unknown[]);
      await client.query("commit");
      return result.rows;
    } catch (err) {
      await client.query("rollback").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  };
}

export async function closePools(): Promise<void> {
  await Promise.all([servicePool.end(), authenticatedPool.end()]);
}
