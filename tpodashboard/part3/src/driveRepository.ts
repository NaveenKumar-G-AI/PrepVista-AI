import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { RuleNode, Student } from "./types.js";
import { validateRuleTree, type ValidationIssue } from "./validate.js";
import { summarizeCohort } from "./summarize.js";
import { canTransition, type DriveStatus } from "./status.js";

export interface CreateDriveInput {
  title: string;
  companyName: string;
  role: string;
  actor: string;
}

export function createDrive(db: DatabaseSync, input: CreateDriveInput): { id: string } {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.exec("BEGIN");
  try {
    db.prepare(
      `INSERT INTO drives (id, title, company_name, role, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'DRAFT', ?, ?)`
    ).run(id, input.title, input.companyName, input.role, now, now);
    db.prepare(
      `INSERT INTO drive_audit_log (drive_id, actor, event_type, from_status, to_status, detail, occurred_at)
       VALUES (?, ?, 'DRIVE_CREATED', NULL, 'DRAFT', NULL, ?)`
    ).run(id, input.actor, now);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return { id };
}

export type AddRuleVersionResult =
  | { ok: true; id: string; versionNumber: number }
  | { ok: false; issues: ValidationIssue[] };

/** Rejects unsafe/malformed trees at the repository boundary too - defense in depth beyond the pure validator. */
export function addRuleVersion(
  db: DatabaseSync,
  driveId: string,
  rule: RuleNode,
  actor: string,
  reason?: string
): AddRuleVersionResult {
  const issues = validateRuleTree(rule);
  if (issues.length > 0) return { ok: false, issues };

  const id = randomUUID();
  const now = new Date().toISOString();
  const row = db
    .prepare(`SELECT COALESCE(MAX(version_number), 0) AS maxVersion FROM eligibility_rule_versions WHERE drive_id = ?`)
    .get(driveId) as { maxVersion: number };
  const versionNumber = row.maxVersion + 1;

  db.exec("BEGIN");
  try {
    db.prepare(
      `INSERT INTO eligibility_rule_versions (id, drive_id, version_number, rule_tree_json, created_by, created_at, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, driveId, versionNumber, JSON.stringify(rule), actor, now, reason ?? null);
    db.prepare(`UPDATE drives SET active_rule_version_id = ?, updated_at = ? WHERE id = ?`).run(id, now, driveId);
    db.prepare(
      `INSERT INTO drive_audit_log (drive_id, actor, event_type, from_status, to_status, detail, occurred_at)
       VALUES (?, ?, 'ELIGIBILITY_RULES_CREATED', NULL, NULL, ?, ?)`
    ).run(driveId, actor, `version ${versionNumber}`, now);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return { ok: true, id, versionNumber };
}

export interface SnapshotResult {
  id: string;
  total: number;
  eligibleCount: number;
  notEligibleCount: number;
}

/** Loads a persisted rule version and re-uses the tested eligibility engine to compute + store a snapshot. */
export function calculateAndSnapshotEligibility(
  db: DatabaseSync,
  driveId: string,
  ruleVersionId: string,
  students: Student[]
): SnapshotResult {
  const versionRow = db
    .prepare(`SELECT rule_tree_json, version_number FROM eligibility_rule_versions WHERE id = ? AND drive_id = ?`)
    .get(ruleVersionId, driveId) as { rule_tree_json: string; version_number: number } | undefined;
  if (!versionRow) throw new Error(`Rule version ${ruleVersionId} not found for drive ${driveId}`);

  const rule = JSON.parse(versionRow.rule_tree_json) as RuleNode;
  const summary = summarizeCohort(students, rule, versionRow.version_number);

  const id = randomUUID();
  const now = new Date().toISOString();
  const eligibleIds = summary.results.filter((r) => r.eligible).map((r) => r.studentId);
  const notEligibleIds = summary.results.filter((r) => !r.eligible).map((r) => r.studentId);

  db.prepare(
    `INSERT INTO eligibility_snapshots
       (id, drive_id, rule_version_id, computed_at, total_students, eligible_count, not_eligible_count,
        category_breakdown_json, eligible_student_ids_json, not_eligible_student_ids_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    driveId,
    ruleVersionId,
    now,
    summary.total,
    summary.eligibleCount,
    summary.notEligibleCount,
    JSON.stringify(summary.byPrimaryFailureCategory),
    JSON.stringify(eligibleIds),
    JSON.stringify(notEligibleIds)
  );
  db.prepare(
    `INSERT INTO drive_audit_log (drive_id, actor, event_type, from_status, to_status, detail, occurred_at)
     VALUES (?, 'SYSTEM', 'ELIGIBILITY_CALCULATED', NULL, NULL, ?, ?)`
  ).run(driveId, `eligible=${summary.eligibleCount} notEligible=${summary.notEligibleCount}`, now);

  return { id, total: summary.total, eligibleCount: summary.eligibleCount, notEligibleCount: summary.notEligibleCount };
}

export type TransitionResult =
  | { ok: true; from: DriveStatus; to: DriveStatus }
  | { ok: false; reason: string };

/** Validates against the state machine and rejects illegal transitions at the backend, per section 8. */
export function transitionDriveStatus(
  db: DatabaseSync,
  driveId: string,
  to: DriveStatus,
  actor: string,
  reason?: string
): TransitionResult {
  const row = db.prepare(`SELECT status FROM drives WHERE id = ?`).get(driveId) as { status: DriveStatus } | undefined;
  if (!row) return { ok: false, reason: `Drive ${driveId} not found` };
  const from = row.status;

  if (!canTransition(from, to)) {
    return { ok: false, reason: `Illegal transition: ${from} -> ${to}` };
  }

  const now = new Date().toISOString();
  const publishedAt = to === "PUBLISHED" ? now : null;
  const closedAt = to === "APPLICATIONS_CLOSED" ? now : null;
  const cancelledAt = to === "CANCELLED" ? now : null;

  db.exec("BEGIN");
  try {
    db.prepare(
      `UPDATE drives
         SET status = ?, updated_at = ?,
             published_at = COALESCE(?, published_at),
             closed_at = COALESCE(?, closed_at),
             cancelled_at = COALESCE(?, cancelled_at)
       WHERE id = ?`
    ).run(to, now, publishedAt, closedAt, cancelledAt, driveId);
    db.prepare(
      `INSERT INTO drive_audit_log (drive_id, actor, event_type, from_status, to_status, detail, occurred_at)
       VALUES (?, ?, 'DRIVE_STATUS_CHANGED', ?, ?, ?, ?)`
    ).run(driveId, actor, from, to, reason ?? null, now);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return { ok: true, from, to };
}

export function getDrive(db: DatabaseSync, driveId: string): unknown {
  return db.prepare(`SELECT * FROM drives WHERE id = ?`).get(driveId);
}

export function getAuditLog(db: DatabaseSync, driveId: string): unknown[] {
  return db.prepare(`SELECT * FROM drive_audit_log WHERE drive_id = ? ORDER BY id ASC`).all(driveId);
}
