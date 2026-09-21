import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

// A single shared connection per server process. better-sqlite3 is
// synchronous, which keeps every repository function simple and is
// the right trade-off for a student-scale local/embedded database —
// there is no network round trip to hide behind async here.

declare global {
  // eslint-disable-next-line no-var
  var __aceaptDb: Database.Database | undefined;
}

function resolveDbPath(): string {
  const configured = process.env.DATABASE_PATH || "./data/aceapt.db";
  const resolved = path.isAbsolute(configured) ? configured : path.join(process.cwd(), configured);
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return resolved;
}

function createConnection(): Database.Database {
  const dbPath = resolveDbPath();
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  const schemaPath = path.join(process.cwd(), "src/lib/db/schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf-8");
  db.exec(schema);

  return db;
}

export function getDb(): Database.Database {
  if (!global.__aceaptDb) {
    global.__aceaptDb = createConnection();
  }
  return global.__aceaptDb;
}

export function newId(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
