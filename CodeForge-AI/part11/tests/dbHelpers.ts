import { Pool } from "pg";
import { randomUUID } from "crypto";

let sharedPool: Pool | null = null;

export function testPool(): Pool {
  if (!sharedPool) {
    sharedPool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return sharedPool;
}

export async function closeTestPool(): Promise<void> {
  if (sharedPool) {
    await sharedPool.end();
    sharedPool = null;
  }
}

/** Creates a throwaway auth.users row (this repo's local shim table — a
 * real Supabase project already has auth.users) and returns its id. */
export async function createTestUser(db: Pool, email?: string): Promise<string> {
  const id = randomUUID();
  await db.query("insert into auth.users (id, email) values ($1, $2)", [id, email ?? `${id}@test.example`]);
  return id;
}

export async function getTemplateIdBySlug(db: Pool, slug: string): Promise<string> {
  const res = await db.query("select id from incident_templates where slug = $1", [slug]);
  if (!res.rows[0]) throw new Error(`Template ${slug} not seeded — run scripts/seed.ts first`);
  return res.rows[0].id;
}

/** Runs `fn` inside a transaction as Postgres role `authenticated`, with
 * auth.uid() resolving to `userId` — exactly mirrors how Supabase's
 * PostgREST/Realtime evaluate RLS for a logged-in request. Always rolls
 * back so tests never leave RLS-path side effects behind. */
export async function asAuthenticatedUser<T>(db: Pool, userId: string | null, fn: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE authenticated");
    if (userId) {
      // SET LOCAL's value position doesn't accept bind parameters; set_config() does.
      await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    }
    const result = await fn(client);
    return result;
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}
