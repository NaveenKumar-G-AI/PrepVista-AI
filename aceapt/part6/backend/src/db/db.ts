import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env';

let instance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (instance) return instance;

  const dir = path.dirname(env.databasePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  instance = new Database(env.databasePath);
  instance.pragma('journal_mode = WAL');
  instance.pragma('foreign_keys = ON');

  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  instance.exec(schema);

  return instance;
}

export function closeDb(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}

/** Reset all tables - used by the e2e demo script and tests for a clean slate. Dev/test only. */
export function resetDb(): void {
  const db = getDb();
  const tables = [
    'audit_log', 'practice_sessions', 'readiness_history', 'assessment_results',
    'attempts', 'question_exposure', 'assessments', 'questions', 'students',
  ];
  const txn = db.transaction(() => {
    for (const t of tables) db.exec(`DELETE FROM ${t}`);
  });
  txn();
}

// ---------------------------------------------------------------------------
// JSON helpers - SQLite has no native JSON column type, so every *_json
// column is stored as TEXT. Centralizing parse/stringify here means a bad
// value fails loudly in one place instead of wherever it happens to be read.
// ---------------------------------------------------------------------------

export function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export function fromJson<T>(value: string | null | undefined, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
