/* eslint-disable no-console */
// Applies every .sql file in /drizzle, in order, against the configured
// SQLite database. `drizzle-kit generate` writes those files; this script
// just executes them. (drizzle-kit's own `push`/`migrate` runners hit a
// driver incompatibility with this better-sqlite3 version in this
// environment — this is the same migration SQL, applied directly.)
import fs from 'fs';
import path from 'path';
import { rawSqlite } from './client';

const migrationsDir = path.join(__dirname, '..', '..', 'drizzle');

function main() {
  if (!fs.existsSync(migrationsDir)) {
    console.log('No drizzle/ migrations directory found — nothing to apply.');
    return;
  }
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    rawSqlite.exec(sql);
    console.log(`Applied ${file}`);
  }
  console.log(`Done — ${files.length} migration file(s) applied.`);
}

main();
