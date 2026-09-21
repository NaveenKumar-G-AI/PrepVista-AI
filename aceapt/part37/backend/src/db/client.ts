import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

/**
 * DATABASE_URL is intentionally left blank in .env.example — point it at
 * your real ACEAPT Postgres instance (ideally a dedicated schema/role for
 * this feature, per the tenant-isolation notes in README.md).
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.on('error', (err) => {
  // A background/idle client error should never crash the process.
  // eslint-disable-next-line no-console
  console.error('[feature-37] unexpected Postgres pool error', err);
});

export const db = drizzle(pool, { schema });
export type Database = typeof db;
