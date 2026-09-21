import pg from 'pg';

const { Pool } = pg;

/** Connection used by the running API — the proof_app role, which has zero
 *  direct table grants and only EXECUTE on the functions in
 *  002_functions.sql. */
export function createPool(overrides?: Partial<pg.PoolConfig>): pg.Pool {
  return new Pool({
    host: process.env.PROOF_DB_HOST ?? 'localhost',
    port: Number(process.env.PROOF_DB_PORT ?? 5432),
    database: process.env.PROOF_DB_NAME ?? 'aceapt_proof',
    user: process.env.PROOF_DB_USER ?? 'proof_app',
    password: process.env.PROOF_DB_PASSWORD ?? '', // fill in for non-dev use
    ...overrides,
  });
}

/** Connection used only by migrations and the demo seed script — an admin
 *  role, never used by the running API. */
export function createAdminPool(overrides?: Partial<pg.PoolConfig>): pg.Pool {
  return new Pool({
    host: process.env.PROOF_DB_HOST ?? 'localhost',
    port: Number(process.env.PROOF_DB_PORT ?? 5432),
    database: process.env.PROOF_DB_NAME ?? 'aceapt_proof',
    user: process.env.PROOF_DB_ADMIN_USER ?? 'postgres',
    password: process.env.PROOF_DB_ADMIN_PASSWORD ?? '', // fill in for non-dev use
    ...overrides,
  });
}
