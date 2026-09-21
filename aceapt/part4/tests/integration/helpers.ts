import "dotenv/config";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { PostgresStore } from "../../src/repositories/postgresStore.js";

export function requireTestDbUrls(): { appUrl: string; migrationUrl: string } {
  const appUrl = process.env.DATABASE_URL;
  const migrationUrl = process.env.MIGRATION_DATABASE_URL;
  if (!appUrl || !migrationUrl) {
    throw new Error("Integration tests require DATABASE_URL and MIGRATION_DATABASE_URL (see .env.example) against a real, migrated Postgres instance.");
  }
  return { appUrl, migrationUrl };
}

export async function createTestStudent(admin: pg.Client, overrides: Partial<{ goal: string; deadline: string | null; availableMinutes: number }> = {}): Promise<string> {
  const id = `test-${randomUUID()}`;
  await admin.query(`INSERT INTO students (id, name, goal, deadline, available_minutes) VALUES ($1,$2,$3,$4,$5)`, [
    id,
    "Test Student",
    overrides.goal ?? "PLACEMENT_PREP",
    overrides.deadline ?? null,
    overrides.availableMinutes ?? 30,
  ]);
  return id;
}

export async function ensureTestSkill(admin: pg.Client, id = "test-skill-root"): Promise<string> {
  await admin.query(`INSERT INTO skills (id, name, category, base_relevance, estimated_learn_minutes) VALUES ($1,$1,'test','{}',20) ON CONFLICT (id) DO NOTHING`, [id]);
  return id;
}

export async function cleanupTestStudents(admin: pg.Client, ids: string[]): Promise<void> {
  if (!ids.length) return;
  await admin.query(`DELETE FROM students WHERE id = ANY($1)`, [ids]);
  // Everything else per-student cascades or is cleaned via explicit deletes since
  // most tables don't FK to students (they're intentionally decoupled — see
  // migrations/001_init.sql comments on Feature 1 ownership).
  await admin.query(`DELETE FROM skill_evidence WHERE student_id = ANY($1)`, [ids]);
  await admin.query(`DELETE FROM learning_attempts WHERE student_id = ANY($1)`, [ids]);
  await admin.query(`DELETE FROM learning_events WHERE student_id = ANY($1)`, [ids]);
  await admin.query(`DELETE FROM interventions WHERE student_id = ANY($1)`, [ids]);
  await admin.query(`DELETE FROM learning_actions WHERE student_id = ANY($1)`, [ids]);
  await admin.query(`DELETE FROM learning_path_nodes WHERE student_id = ANY($1)`, [ids]);
  await admin.query(`DELETE FROM learning_path_versions WHERE student_id = ANY($1)`, [ids]);
  await admin.query(`DELETE FROM learning_paths WHERE student_id = ANY($1)`, [ids]);
}

export function newAdminClient(migrationUrl: string): pg.Client {
  return new pg.Client({ connectionString: migrationUrl });
}

export function newAppStore(appUrl: string): PostgresStore {
  return PostgresStore.fromConnectionString(appUrl);
}
