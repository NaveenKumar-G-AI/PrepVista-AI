import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema';
import { env } from '../config/env';

function resolveSqlitePath(databaseUrl: string): string {
  // Accepts "file:./dev.db" (Prisma-style URL, kept for familiarity) or a bare path.
  if (databaseUrl.startsWith('file:')) return databaseUrl.slice('file:'.length);
  return databaseUrl;
}

const sqlite = new Database(resolveSqlitePath(env.DATABASE_URL));
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('foreign_keys = ON');

export const db = drizzle(sqlite, { schema });
export const rawSqlite = sqlite;
