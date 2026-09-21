import type { PoolClient } from "pg";
import { pool, servicePool } from "./pool.js";

/**
 * Runs `fn` with a Postgres client that has `app.current_student_id` set for
 * the lifetime of one transaction. The RLS policies in
 * db/migrations/0001_init.sql do the actual enforcement — this function's
 * only job is to make sure that setting is never skipped, forgotten, or set
 * on the wrong connection (SET LOCAL is transaction-scoped and the client is
 * always released back to the pool afterwards, so nothing leaks to the next
 * request that happens to reuse the same pooled connection).
 *
 * This is the ONLY way repository code should touch student-scoped tables.
 * Every exported repository function takes a `studentId` and goes through
 * here rather than pulling a client from the pool directly.
 */
export async function withStudentContext<T>(
  studentId: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // SET LOCAL's grammar doesn't accept a bind parameter ($1) — set_config()
    // is the standard way to set a transaction-local GUC with one.
    await client.query("SELECT set_config('app.current_student_id', $1, true)", [studentId]);
    await client.query("SELECT set_config('app.is_service_role', 'false', true)");
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

/**
 * Service-role context for background jobs / cross-student rollups (Section
 * 54 cohort views). Requires DATABASE_SERVICE_URL to be configured — throws
 * otherwise, rather than silently falling back to a context that could leak
 * data across students.
 */
export async function withServiceContext<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  if (!servicePool) {
    throw new Error(
      "DATABASE_SERVICE_URL is not configured — service-role queries are disabled. " +
        "See .env.example."
    );
  }
  const client = await servicePool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.is_service_role', 'true', true)");
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
