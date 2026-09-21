import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env';

// ':memory:' is better-sqlite3's own special filename for a private, in-process
// database - used by the test suite for fast, fully isolated runs. Anything
// else is treated as a real file path relative to the process cwd.
const isMemory = env.DATABASE_PATH === ':memory:';
const resolvedPath = isMemory ? ':memory:' : path.resolve(process.cwd(), env.DATABASE_PATH);
if (!isMemory) {
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export const db = new Database(resolvedPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function withTransaction<T>(fn: () => T): T {
  return db.transaction(fn)();
}
