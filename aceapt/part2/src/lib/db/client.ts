import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";

/**
 * Persistence choice, documented honestly:
 *
 * This uses Node's built-in `node:sqlite` module (stable enough for this
 * purpose since Node 22) rather than Prisma or better-sqlite3. Reasoning:
 *   - Zero extra dependencies and zero external binary/CDN download, which
 *     matters in network-restricted environments and keeps `npm install`
 *     fully reproducible.
 *   - Synchronous API, which fits Next.js route handlers cleanly without
 *     adding an async ORM layer for what is, at this scale, simple
 *     relational access.
 *   - It is easy to swap: every query lives behind the repository functions
 *     in `lib/db/repo.ts`. Moving to Postgres/Prisma later means rewriting
 *     that one file, not the domain or API layers.
 *
 * `node --experimental-sqlite` warnings are expected and harmless; the
 * module is marked experimental upstream but the subset used here
 * (prepare/run/get/all, transactions) is small and stable.
 */

const DB_PATH = process.env.DATABASE_PATH || "./data/aceapt.db";

declare global {
  // eslint-disable-next-line no-var
  var __aceaptDb: DatabaseSync | undefined;
}

function createConnection(): DatabaseSync {
  // DB_PATH is intentionally runtime-configurable (via DATABASE_PATH), so
  // Turbopack can't statically resolve it — the ignore comment prevents it
  // from tracing (and bundling) the entire project just because of this one
  // dynamic path.
  const resolved = path.resolve(/*turbopackIgnore: true*/ process.cwd(), DB_PATH);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const db = new DatabaseSync(resolved);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

/**
 * Singleton guarded on globalThis so Next.js dev-mode module reloading
 * doesn't open a fresh connection (and fresh WAL lock) on every hot reload.
 */
export function getDb(): DatabaseSync {
  if (!global.__aceaptDb) {
    global.__aceaptDb = createConnection();
  }
  return global.__aceaptDb;
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
