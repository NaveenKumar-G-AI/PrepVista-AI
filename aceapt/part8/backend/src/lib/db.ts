import pg from "pg";
import "dotenv/config";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.warn("[db] DATABASE_URL is not set - the app pool will fail to connect.");
}
if (!process.env.SERVICE_DATABASE_URL) {
  // eslint-disable-next-line no-console
  console.warn("[db] SERVICE_DATABASE_URL is not set - migrations/seeding/background jobs will fail.");
}

/** RLS-bound pool. Used ONLY through withStudentScope(). Never query this directly
 *  for a student-scoped table (mastery_evidence, mastery_state, verification_attempts,
 *  review_schedule, mastery_history_events, question_exposures) - RLS will silently
 *  return zero rows because app.current_student_id won't be set. */
export const appPool = new Pool({ connectionString: process.env.DATABASE_URL });

/** BYPASSRLS pool. Used for migrations, seeding, and cross-student background jobs
 *  (review sweep, regression sweep). Never wire this into a per-request student
 *  code path - that would defeat the isolation guarantee entirely. */
export const servicePool = new Pool({ connectionString: process.env.SERVICE_DATABASE_URL });

/**
 * Runs `fn` with a client whose session has app.current_student_id set for the
 * duration of one transaction, so every RLS policy on a student-scoped table
 * applies automatically and a bug that forgets a WHERE student_id=... clause
 * fails closed (zero rows) instead of leaking another student's data.
 *
 * set_config(...) (not `SET LOCAL x = $1`) is used deliberately: Postgres does
 * not accept a bind parameter as the value in a literal SET statement, but
 * set_config is an ordinary function call and IS safely parameterizable.
 */
export async function withStudentScope<T>(
  studentId: string,
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await appPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_student_id', $1, true)", [studentId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/** For service/background code that legitimately needs cross-student access. */
export async function withServiceScope<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await servicePool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function closePools(): Promise<void> {
  await Promise.all([appPool.end(), servicePool.end()]);
}
