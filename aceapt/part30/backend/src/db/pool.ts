import pg from "pg";
import "dotenv/config";

const { Pool } = pg;

/**
 * IMPORTANT: this pool is what every request handler uses, and RLS only
 * protects data if the connection role is a normal, non-superuser role
 * with FORCE ROW LEVEL SECURITY in effect (Postgres superusers, and table
 * owners without FORCE, always bypass RLS). PGUSER must be `path_app`
 * (created by migration 0003) in every environment, not `postgres`.
 * Schema/admin work (migrate.ts, and the tenant-creation step in seed.ts)
 * uses adminPool below instead, on purpose.
 */
export const pool = new Pool({
  host: process.env.PGHOST || "localhost",
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || "aceapt_path_dev",
  user: process.env.PGUSER || "path_app",
  password: process.env.PGPASSWORD || undefined,
});

/** Superuser/owner connection for migrations and seeding only -- never used to serve a request. */
export const adminPool = new Pool({
  host: process.env.PGHOST || "localhost",
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || "aceapt_path_dev",
  user: process.env.PGADMIN_USER || "postgres",
  password: process.env.PGADMIN_PASSWORD || undefined,
});

/**
 * Every tenant-scoped query must run through this. It opens a transaction,
 * sets the RLS session variable with SET LOCAL (scoped to the transaction,
 * never leaks to the next pooled connection use), runs the callback, and
 * commits/rolls back. This is the one seam that guarantees a route can't
 * accidentally read across tenants -- see db/migrations/0003_rls.sql.
 *
 * SET LOCAL cannot bind a parameter placeholder ($1) -- it needs the value
 * inlined into the SQL text. tenantId is always a value we generated
 * ourselves (uuid from the auth/session layer, never raw user input), and
 * we still defensively validate the shape before interpolating it.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function withTenant<T>(
  tenantId: string,
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  if (!UUID_RE.test(tenantId)) {
    throw new Error(`withTenant: refusing non-uuid tenantId "${tenantId}"`);
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SET LOCAL app.current_tenant_id = '${tenantId}'`);
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

/** For migration/seed scripts only -- admin role, runs without a tenant context, bypasses RLS. */
export async function withAdmin<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await adminPool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
