import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { env } from '../config/env';

let pool: Pool | null = null;
let db: NodePgDatabase<typeof schema> | null = null;

export function getDb(): NodePgDatabase<typeof schema> {
  if (!env.databaseUrl) {
    throw new Error(
      'DATABASE_URL is not set. Configure it in .env, or leave it blank to run the service in in-memory mode (see src/api/app.ts).',
    );
  }
  if (!db) {
    pool = new Pool({ connectionString: env.databaseUrl });
    db = drizzle(pool, { schema });
  }
  return db;
}

export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    db = null;
  }
}
