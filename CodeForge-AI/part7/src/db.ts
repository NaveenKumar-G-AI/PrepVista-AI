import { Pool, PoolClient } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

const base = {
  host: process.env.PGHOST || 'localhost',
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'codeforge',
};

/**
 * codeforge_admin — superuser-equivalent, BYPASSES ROW LEVEL SECURITY.
 *
 * Use ONLY for: migrations, seeding, and the grading worker's need to read
 * `challenges.hidden_tests` (a column codeforge_app is not granted SELECT
 * on at all — see db/migrations/003). Never route an ordinary student or
 * TPO request through this pool; that would silently defeat every RLS
 * policy in 003_rls_and_privileges.sql.
 */
export const adminPool = new Pool({
  ...base,
  user: process.env.PG_ADMIN_USER || 'codeforge_admin',
  password: process.env.PG_ADMIN_PASSWORD || 'admin_local_dev_pw', // REPLACE IN PRODUCTION
});

/**
 * codeforge_app — NOSUPERUSER, NOBYPASSRLS. Every student/TPO-facing
 * request goes through this pool inside withUserContext(), so Postgres RLS
 * is genuinely enforced per request, not merely checked in application code.
 */
export const appPool = new Pool({
  ...base,
  user: process.env.PG_APP_USER || 'codeforge_app',
  password: process.env.PG_APP_PASSWORD || 'app_local_dev_pw', // REPLACE IN PRODUCTION
});

export type AppRole = 'student' | 'tpo' | 'management';

/**
 * Runs `fn` inside a transaction with the Postgres session variables that
 * every RLS policy in 003_rls_and_privileges.sql reads
 * (current_app_user_id() / current_app_role()) set for the duration of that
 * transaction only (`set_config(..., true)` = local to the transaction).
 *
 * This is the standalone-Postgres analog of what Supabase does automatically
 * via the JWT on every request (auth.uid() + the role claim). On real
 * Supabase you would delete this helper and rely on the platform instead —
 * the RLS policies themselves would not need to change.
 */
export async function withUserContext<T>(
  userId: string,
  role: AppRole,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await appPool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [userId]);
    await client.query(`SELECT set_config('app.current_role', $1, true)`, [role]);
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

/** Privileged helper — admin pool, no RLS. Use sparingly and deliberately. */
export async function withAdmin<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await adminPool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function closePools() {
  await adminPool.end();
  await appPool.end();
}
