import Database from "better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");

/**
 * Opens a database and applies every .sql file in /migrations, in
 * filename order, inside a single transaction. Safe to call repeatedly —
 * SQLite will simply fail loudly if a migration is re-applied against an
 * existing schema, which is what we want in dev/test.
 *
 * dbPath: ":memory:" for tests, a file path for dev/demo persistence.
 *
 * PRODUCTION NOTE: this file is the ONLY place that is SQLite-specific.
 * To run against Postgres, replace this module with a `pg` Pool and swap
 * the concrete repository implementations (they depend only on the
 * interfaces in src/repositories/*Repository.ts, not on this file).
 */
export function openDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}

export function runMigrations(db: Database.Database): void {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='_migrations'"
    )
    .get();

  if (!applied) {
    db.exec(
      "CREATE TABLE _migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)"
    );
  }

  const alreadyApplied = new Set(
    db
      .prepare("SELECT name FROM _migrations")
      .all()
      .map((r: any) => r.name)
  );

  const tx = db.transaction(() => {
    for (const file of files) {
      if (alreadyApplied.has(file)) continue;
      const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
      db.exec(sql);
      db.prepare(
        "INSERT INTO _migrations (name, applied_at) VALUES (?, ?)"
      ).run(file, new Date().toISOString());
    }
  });
  tx();
}

export function createTestDatabase(): Database.Database {
  const db = openDatabase(":memory:");
  runMigrations(db);
  return db;
}
