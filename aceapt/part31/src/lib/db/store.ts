// MVP persistence adapter.
//
// The engine layer and API routes never talk to this file directly — they
// go through lib/db/repository.ts. That means the *only* thing that has to
// change to move off this file-backed store onto a real database is this
// module (swap readCollection/writeCollection for a Postgres/Prisma client
// with the same per-entity read/write shape). See README > "Data model &
// production swap-in" for the intended relational schema.
//
// Deliberately simple for an MVP (spec §66: do not overbuild): synchronous
// fs reads/writes, one JSON file per collection, no external services.

import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function filePath(name: string) {
  return path.join(DATA_DIR, `${name}.json`);
}

export function readCollection<T>(name: string): T[] {
  ensureDir();
  const fp = filePath(name);
  if (!fs.existsSync(fp)) {
    fs.writeFileSync(fp, '[]', 'utf-8');
    return [];
  }
  try {
    const raw = fs.readFileSync(fp, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function writeCollection<T>(name: string, data: T[]): void {
  ensureDir();
  fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2), 'utf-8');
}
