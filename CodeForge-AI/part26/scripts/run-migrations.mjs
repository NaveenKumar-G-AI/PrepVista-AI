// Applies src/db/migrations/*.sql in filename order. Needs a role that can
// CREATE TABLE/ROLE/FUNCTION (a superuser or Postgres owner locally; on
// Supabase, run these through the Supabase CLI/dashboard migration flow
// instead, which already runs as the postgres owner role).
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const { Client } = pg;

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(here, '..', 'src', 'db', 'migrations');

const connectionString = process.env.DATABASE_URL_MIGRATOR;
if (!connectionString) {
  console.error('Set DATABASE_URL_MIGRATOR to a role with DDL privileges (see .env.example) before running migrations.');
  process.exit(1);
}

const files = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();

const client = new Client({ connectionString });
await client.connect();
try {
  for (const file of files) {
    const sql = readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`applying ${file} ...`);
    await client.query(sql);
    console.log(`  ok`);
  }
  console.log(`applied ${files.length} migration file(s).`);
} finally {
  await client.end();
}
