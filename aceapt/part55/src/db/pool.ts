import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requireEnv(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) {
    throw new Error(
      `Missing required env var ${name}. Copy .env.example to .env and fill in your values.`
    );
  }
  return v;
}

function buildPool(userEnv: string, passwordEnv: string): pg.Pool {
  return new Pool({
    host: process.env.PGHOST ?? '127.0.0.1',
    port: Number(process.env.PGPORT ?? 5432),
    database: requireEnv('PGDATABASE'),
    user: requireEnv(userEnv),
    password: requireEnv(passwordEnv),
    max: Number(process.env.PGPOOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
  });
}

/** Full-column, tenant-scoped role — admin API + calibration workers. */
export const appPool = buildPool('DIFFICULTY_APP_DB_USER', 'DIFFICULTY_APP_DB_PASSWORD');

/** Column-restricted role behind student_difficulty_view — student endpoints only. */
export const studentPool = buildPool(
  'DIFFICULTY_STUDENT_APP_DB_USER',
  'DIFFICULTY_STUDENT_APP_DB_PASSWORD'
);

/**
 * Runs `fn` inside a transaction with `app.tenant_id` set for the duration
 * of that transaction, so every RLS policy in migrations/002_roles_and_rls.sql
 * sees the right tenant.
 *
 * IMPORTANT: this uses `select set_config('app.tenant_id', $1, true)` with a
 * real bound parameter — NOT a string-interpolated `SET LOCAL app.tenant_id
 * = '${tenantId}'`. Postgres's wire protocol does not accept parameter
 * placeholders inside a bare SET/SET LOCAL statement, so that version either
 * silently fails to bind or opens a SQL-injection seam if you fall back to
 * interpolating the value by hand. set_config's third argument (`true`) is
 * what makes it local-to-transaction, matching SET LOCAL's reset-on-commit
 * behaviour without ever inlining a string into SQL text.
 */
export async function withTenant<T>(
  pool: pg.Pool,
  tenantId: string,
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  if (!UUID_RE.test(tenantId)) {
    throw new Error(`withTenant received a non-UUID tenantId: ${JSON.stringify(tenantId)}`);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
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

export async function closeAllPools(): Promise<void> {
  await Promise.all([appPool.end(), studentPool.end()]);
}

/**
 * An elevated pool for migrations, seed scripts, the worker's job-claiming
 * queries, and tests — anything that needs to read/write difficulty_* rows
 * without RLS in the way (e.g. claiming a run before app.tenant_id would
 * even be known) or needs access to the pre-existing tables Feature 55
 * doesn't own. Never used by request-serving API code — every controller
 * goes through appPool/studentPool and withTenant().
 */
export function makeSuperPool(): pg.Pool {
  return new Pool({
    host: process.env.PGHOST ?? '127.0.0.1',
    port: Number(process.env.PGPORT ?? 5432),
    database: requireEnv('PGDATABASE'),
    user: process.env.PGSUPERUSER ?? 'postgres',
    password: process.env.PGSUPERUSER_PASSWORD,
  });
}
