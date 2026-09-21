import fs from 'fs';
import path from 'path';

/** Deletes and recreates the test SQLite file's schema from the checked-in migration SQL. Call once in beforeAll. */
export function resetTestDatabase() {
  const dbPath = path.join(__dirname, '..', 'test.db');
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    const p = dbPath + suffix;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  // Import AFTER deleting the file so better-sqlite3 opens a fresh one.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { rawSqlite } = require('../src/db/client');
  const migrationsDir = path.join(__dirname, '..', 'drizzle');
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    rawSqlite.exec(sql);
  }
}
