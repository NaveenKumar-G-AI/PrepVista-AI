import Database from "better-sqlite3";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import bcrypt from "bcryptjs";
import { applySchema } from "../src/db/connection.js";
import { createApp } from "../src/app.js";
import { newId, nowIso } from "../src/util/id.js";

export interface TestContext {
  db: Database.Database;
  app: ReturnType<typeof createApp>;
  dbPath: string;
  institutionId: string;
  userId: string;
  userEmail: string;
  userPassword: string;
}

/** Creates a real sqlite file (not :memory:) in a temp dir so persistence-after-reopen is genuinely testable. */
export function makeTestContext(): TestContext {
  const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pv-test-")), "test.sqlite3");
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  applySchema(db);

  const institutionId = newId();
  const userId = newId();
  const userEmail = `tpo-${userId.slice(0, 8)}@test.local`;
  const userPassword = "test-password-123";

  db.prepare(`insert into institution (id, name, created_at) values (?, ?, ?)`).run(institutionId, "Test Institute", nowIso());
  db.prepare(
    `insert into app_user (id, institution_id, name, email, password_hash, role, created_at) values (?, ?, ?, ?, ?, ?, ?)`
  ).run(userId, institutionId, "Test TPO", userEmail, bcrypt.hashSync(userPassword, 4), "TPO", nowIso());

  const app = createApp(db);
  return { db, app, dbPath, institutionId, userId, userEmail, userPassword };
}

/** Second institution, for tenant-isolation tests, sharing the same db file. */
export function addSecondInstitution(ctx: TestContext) {
  const institutionId = newId();
  const userId = newId();
  const userEmail = `other-${userId.slice(0, 8)}@test.local`;
  const userPassword = "test-password-123";
  ctx.db.prepare(`insert into institution (id, name, created_at) values (?, ?, ?)`).run(institutionId, "Other Institute", nowIso());
  ctx.db
    .prepare(`insert into app_user (id, institution_id, name, email, password_hash, role, created_at) values (?, ?, ?, ?, ?, ?, ?)`)
    .run(userId, institutionId, "Other TPO", userEmail, bcrypt.hashSync(userPassword, 4), "TPO", nowIso());
  return { institutionId, userId, userEmail, userPassword };
}

export function cleanupTestContext(ctx: TestContext) {
  ctx.db.close();
  fs.rmSync(path.dirname(ctx.dbPath), { recursive: true, force: true });
}
