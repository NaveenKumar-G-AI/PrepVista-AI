import * as fs from 'fs';
import * as path from 'path';
import { pool } from './pool';

const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'migrations');

async function alreadyApplied(version: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 FROM schema_migrations WHERE version = $1`,
    [version],
  ).catch(() => null);
  return Boolean(result && result.rowCount && result.rowCount > 0);
}

export async function runMigrations(): Promise<void> {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    // schema_migrations itself is created inside 001, so guard the lookup
    // for a completely fresh database.
    const tableExists = await pool
      .query(`SELECT to_regclass('public.schema_migrations') as reg`)
      .then((r) => Boolean(r.rows[0]?.reg));

    if (tableExists && (await alreadyApplied(version))) {
      console.log(`[migrate] skipping ${file} (already applied)`);
      continue;
    }

    console.log(`[migrate] applying ${file}...`);
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    await pool.query(sql);
    console.log(`[migrate] applied ${file}`);
  }
}

if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('[migrate] all migrations applied');
      return pool.end();
    })
    .catch((err) => {
      console.error('[migrate] failed:', err);
      process.exitCode = 1;
    });
}
