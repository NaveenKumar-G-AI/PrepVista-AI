import pg from "pg";
import { env } from "../config/env.js";

const { Pool } = pg;

function makePool(user: string, password: string): pg.Pool {
  return new Pool({
    host: env.pg.host,
    port: env.pg.port,
    database: env.pg.database,
    user,
    password,
    max: 10,
    idleTimeoutMillis: 30000
  });
}

/** Migrations only. Never used to serve a request — see db/00-roles.sql for why. */
export const ownerPool = makePool(env.pg.owner.user, env.pg.owner.password);

/** Normal per-student request traffic. RLS-bound to app.student_id. */
export const appPool = makePool(env.pg.app.user, env.pg.app.password);

/** Background jobs / cross-student reads (outbox dispatch, admin reporting). */
export const servicePool = makePool(env.pg.service.user, env.pg.service.password);

/**
 * Runs `fn` inside a transaction on the app pool with app.student_id set via
 * SET LOCAL, so the RLS policy on every Feature 51 table scopes every query
 * inside `fn` to this student — and to nobody else, even if the query itself
 * forgets a WHERE clause. SET LOCAL is transaction-scoped, so a pooled
 * connection can never leak one student's context into the next request that
 * happens to reuse it.
 */
export async function withStudentContext<T>(
  studentId: string,
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await appPool.connect();
  try {
    await client.query("BEGIN");
    // SET LOCAL does not accept bind parameters ($1) — set_config() is the
    // parameterized equivalent (third arg true = LOCAL, transaction-scoped).
    await client.query("SELECT set_config('app.student_id', $1, true)", [studentId]);
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

/** Runs `fn` on the service pool inside a transaction (broad, cross-student access). */
export async function withServiceContext<T>(
  fn: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await servicePool.connect();
  try {
    await client.query("BEGIN");
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

export async function closeAllPools(): Promise<void> {
  await Promise.all([ownerPool.end(), appPool.end(), servicePool.end()]);
}
