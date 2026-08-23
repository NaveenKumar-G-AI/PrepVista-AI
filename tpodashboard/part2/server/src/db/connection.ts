import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_PATH = process.env.DATABASE_FILE ?? path.join(__dirname, "..", "..", "data", "prepvista-part2.sqlite3");

export function openDb(dbPath: string = DB_PATH): Database.Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

export function applySchema(db: Database.Database) {
  const schemaPath = path.join(__dirname, "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf-8");
  db.exec(schema);
}

/** Returns true if the schema has already been applied (idempotent boot). */
export function isInitialized(db: Database.Database): boolean {
  const row = db
    .prepare("select name from sqlite_master where type = 'table' and name = 'company'")
    .get();
  return Boolean(row);
}

export function ensureSchema(db: Database.Database) {
  if (!isInitialized(db)) {
    applySchema(db);
  }
}

export const defaultDbPath = DB_PATH;
