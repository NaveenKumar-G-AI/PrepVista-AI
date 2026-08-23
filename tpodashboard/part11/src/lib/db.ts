import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function resolveDbPath(): string {
  const url = process.env.DATABASE_URL ?? 'file:./db/dev.db';
  const raw = url.replace(/^file:/, '');
  return path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
}

const dbPath = resolveDbPath();
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

/** Opaque, non-sequential, URL-safe id. Not a security token — just a primary key. */
export function genId(): string {
  return crypto.randomBytes(16).toString('base64url');
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function runMigrations(): void {
  const schemaPath = path.join(process.cwd(), 'db', 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(sql);
}

/** Wraps a synchronous block of repository calls in a SQLite transaction. */
export function withTransaction<T>(fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
