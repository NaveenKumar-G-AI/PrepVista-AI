import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config();

/**
 * Runs db/migrations/*.sql in filename order against aceapt_owner (the
 * schema-owning role -- see db/bootstrap-roles.sql for why this must be a
 * DIFFERENT role than the one the app server connects as). Tracks applied
 * files in schema_migrations so re-running this is a no-op for files already
 * applied -- safe to wire into a deploy step.
 *
 * Usage: PGUSER=aceapt_owner PGPASSWORD=... npm run migrate
 * (falls back to PGUSER/PGPASSWORD env vars; does NOT reuse the app's
 * PGUSER=aceapt_app on purpose -- that role cannot run DDL against tables it
 * doesn't own.)
 */
async function main() {
  const client = new Client({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'aceapt_feature40',
    user: process.env.MIGRATE_PGUSER || 'aceapt_owner',
    password: process.env.MIGRATE_PGPASSWORD || '',
  });
  await client.connect();
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    const { rows } = await client.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [file]);
    if (rows.length > 0) {
      console.log(`skip (already applied): ${file}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    console.log(`applying: ${file}`);
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
  }

  await client.end();
  console.log('migrations complete');
}

main().catch((err) => {
  console.error('migration failed:', err);
  process.exit(1);
});
