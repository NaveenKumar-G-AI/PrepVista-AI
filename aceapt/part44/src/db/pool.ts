// A single pg Pool, plus the one function every request-handling code
// path must go through: withStudentContext(). It is the only place
// app.current_student_id gets set, and it always does so with a bound
// parameter via set_config() rather than a string-interpolated
// `SET LOCAL app.current_student_id = ...`.
//
// That distinction matters: an earlier ACEAPT feature (Feature 13, see
// project history) shipped a real bug where SET LOCAL was given a bind
// parameter directly and Postgres silently did not apply it the way the
// code assumed. set_config() with $1 does not have that failure mode -
// it is a normal function call, not special SQL syntax, so it accepts a
// bound parameter exactly like any other function argument would.
import pg from "pg";

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    pool = new pg.Pool({ connectionString, max: 10 });
    pool.on("error", (err) => {
      // A dropped idle connection must not crash the process (this was
      // one of the real bugs found in an earlier ACEAPT feature: an
      // unhandled pool error event took the whole server down).
      // eslint-disable-next-line no-console
      console.error("pg pool error (handled, not fatal)", err);
    });
  }
  return pool;
}

/**
 * Runs `fn` with a client whose session has app.current_student_id set
 * for the duration of one transaction, so every RLS policy in
 * db/migrations sees the right student and nothing else. Commits on
 * success, rolls back on any thrown error, always releases the client.
 */
export async function withStudentContext<T>(
  studentId: string,
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_student_id', $1, true)", [studentId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
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
