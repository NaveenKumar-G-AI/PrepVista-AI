import 'dotenv/config';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(__dirname, '../../migrations');

/**
 * Applies migrations/*.sql in filename order, tracked in schema_migrations
 * so re-running is a no-op for anything already applied. Deliberately does
 * NOT touch db/reference/ — that folder is a local-testing stand-in for
 * tables Feature 55 does not own (see that folder's own header comment) and
 * has nothing to do with what a real deployment should run.
 *
 * Connects as PGSUPERUSER (falls back to PGUSER) because CREATE ROLE and
 * GRANT in 002_roles_and_rls.sql need elevated privileges that
 * difficulty_app deliberately does NOT have.
 */
async function main() {
  const pool = new pg.Pool({
    host: process.env.PGHOST ?? '127.0.0.1',
    port: Number(process.env.PGPORT ?? 5432),
    database: process.env.PGDATABASE,
    user: process.env.PGSUPERUSER ?? process.env.PGUSER ?? 'postgres',
    password: process.env.PGSUPERUSER_PASSWORD ?? process.env.PGPASSWORD,
  });

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const { rows } = await client.query('SELECT 1 FROM schema_migrations WHERE filename = $1', [file]);
      if (rows.length > 0) {
        console.log(`skip  ${file} (already applied)`);
        continue;
      }
      const sql = readFileSync(path.join(migrationsDir, file), 'utf8');
      console.log(`apply ${file}`);
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    console.log('Also set role passwords now via:');
    console.log('  psql -c "ALTER ROLE difficulty_app PASSWORD \'...\';"');
    console.log('  psql -c "ALTER ROLE difficulty_student_app PASSWORD \'...\';"');
    console.log('(left out of the migration itself so passwords never live in a SQL file — see .env.example)');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
