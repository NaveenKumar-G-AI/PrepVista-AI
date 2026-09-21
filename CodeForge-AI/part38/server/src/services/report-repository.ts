import crypto from "node:crypto";
import { all, one, run } from "../db/database";
import { ReportLifecycleStatus, ReportType } from "../domain/enums";
import { assertValidTransition } from "../domain/state-machine";
import type { TechnicalMasteryReportDto } from "../domain/dto";

export interface ReportRow {
  id: string;
  studentId: string;
  orgId: string;
  reportType: ReportType;
  schemaVersion: string;
  sourceDataVersion: number;
  status: ReportLifecycleStatus;
  batchId: string | null;
  requestedById: string;
  requestedAt: string;
  generatedAt: string | null;
  failureReason: string | null;
  dto: TechnicalMasteryReportDto | null;
  narrativeSource: "ai" | "fallback" | null;
  narrativeValidated: boolean | null;
  createdAt: string;
  updatedAt: string;
}

interface DbReportRow {
  id: string;
  student_id: string;
  org_id: string;
  report_type: string;
  schema_version: string;
  source_data_version: number;
  status: string;
  batch_id: string | null;
  requested_by_id: string;
  requested_at: string;
  generated_at: string | null;
  failure_reason: string | null;
  dto: string | null;
  narrative_source: string | null;
  narrative_validated: number | null;
  created_at: string;
  updated_at: string;
}

function fromDb(row: DbReportRow): ReportRow {
  return {
    id: row.id,
    studentId: row.student_id,
    orgId: row.org_id,
    reportType: row.report_type as ReportType,
    schemaVersion: row.schema_version,
    sourceDataVersion: row.source_data_version,
    status: row.status as ReportLifecycleStatus,
    batchId: row.batch_id,
    requestedById: row.requested_by_id,
    requestedAt: row.requested_at,
    generatedAt: row.generated_at,
    failureReason: row.failure_reason,
    dto: row.dto ? (JSON.parse(row.dto) as TechnicalMasteryReportDto) : null,
    narrativeSource: (row.narrative_source as "ai" | "fallback" | null) ?? null,
    narrativeValidated: row.narrative_validated === null ? null : row.narrative_validated === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createReport(input: {
  studentId: string;
  orgId: string;
  reportType: ReportType;
  schemaVersion: string;
  sourceDataVersion: number;
  requestedById: string;
  batchId?: string | null;
}): ReportRow {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  run(
    `INSERT INTO technical_mastery_report
       (id, student_id, org_id, report_type, schema_version, source_data_version, status,
        batch_id, requested_by_id, requested_at, generated_at, failure_reason, dto,
        narrative_source, narrative_validated, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
    [
      id,
      input.studentId,
      input.orgId,
      input.reportType,
      input.schemaVersion,
      input.sourceDataVersion,
      ReportLifecycleStatus.REQUESTED,
      input.batchId ?? null,
      input.requestedById,
      now,
      now,
      now,
    ],
  );
  const created = getReportById(id);
  if (!created) throw new Error("Failed to read back created report row");
  return created;
}

export function getReportById(id: string): ReportRow | null {
  const row = one<DbReportRow>(`SELECT * FROM technical_mastery_report WHERE id = ?`, [id]);
  return row ? fromDb(row) : null;
}

export function listReportsForStudent(studentId: string): ReportRow[] {
  const rows = all<DbReportRow>(
    `SELECT * FROM technical_mastery_report WHERE student_id = ? ORDER BY created_at DESC`,
    [studentId],
  );
  return rows.map(fromDb);
}

export function findReusableCompletedReport(input: {
  studentId: string;
  reportType: ReportType;
  schemaVersion: string;
  sourceDataVersion: number;
}): ReportRow | null {
  const row = one<DbReportRow>(
    `SELECT * FROM technical_mastery_report
     WHERE student_id = ? AND report_type = ? AND schema_version = ? AND source_data_version = ?
       AND status = ?
     ORDER BY generated_at DESC LIMIT 1`,
    [input.studentId, input.reportType, input.schemaVersion, input.sourceDataVersion, ReportLifecycleStatus.COMPLETED],
  );
  return row ? fromDb(row) : null;
}

/** Non-terminal report matching the same (student, type, schema, source version) — used to collapse duplicate requests (brief §64). */
export function findActiveReport(input: {
  studentId: string;
  reportType: ReportType;
  schemaVersion: string;
  sourceDataVersion: number;
}): ReportRow | null {
  const row = one<DbReportRow>(
    `SELECT * FROM technical_mastery_report
     WHERE student_id = ? AND report_type = ? AND schema_version = ? AND source_data_version = ?
       AND status IN (?, ?, ?, ?)
     ORDER BY requested_at DESC LIMIT 1`,
    [
      input.studentId,
      input.reportType,
      input.schemaVersion,
      input.sourceDataVersion,
      ReportLifecycleStatus.REQUESTED,
      ReportLifecycleStatus.QUEUED,
      ReportLifecycleStatus.GENERATING,
      ReportLifecycleStatus.VALIDATING,
    ],
  );
  return row ? fromDb(row) : null;
}

export function findOldestQueued(): ReportRow | null {
  const row = one<DbReportRow>(
    `SELECT * FROM technical_mastery_report WHERE status = ? ORDER BY requested_at ASC LIMIT 1`,
    [ReportLifecycleStatus.QUEUED],
  );
  return row ? fromDb(row) : null;
}

/** Every status write goes through here so illegal transitions throw instead of silently corrupting state. */
export function transitionStatus(
  id: string,
  to: ReportLifecycleStatus,
  extra: { failureReason?: string | null; dto?: TechnicalMasteryReportDto; narrativeSource?: "ai" | "fallback"; narrativeValidated?: boolean } = {},
): ReportRow {
  const existing = getReportById(id);
  if (!existing) throw new Error(`Report ${id} not found`);
  assertValidTransition(existing.status, to);

  const now = new Date().toISOString();
  const generatedAt = to === ReportLifecycleStatus.COMPLETED ? now : existing.generatedAt;

  run(
    `UPDATE technical_mastery_report
     SET status = ?, failure_reason = ?, dto = ?, narrative_source = ?, narrative_validated = ?,
         generated_at = ?, updated_at = ?
     WHERE id = ?`,
    [
      to,
      extra.failureReason ?? null,
      extra.dto ? JSON.stringify(extra.dto) : existing.dto ? JSON.stringify(existing.dto) : null,
      extra.narrativeSource ?? existing.narrativeSource,
      extra.narrativeValidated === undefined ? (existing.narrativeValidated === null ? null : existing.narrativeValidated ? 1 : 0) : extra.narrativeValidated ? 1 : 0,
      generatedAt,
      now,
      id,
    ],
  );
  const updated = getReportById(id);
  if (!updated) throw new Error("Failed to read back updated report row");
  return updated;
}

// ---- Audit log -------------------------------------------------------

export function insertAccessLog(input: {
  reportId: string;
  userId: string;
  action: string;
  metadata?: Record<string, unknown>;
}): void {
  run(
    `INSERT INTO report_access_log (id, report_id, user_id, action, occurred_at, metadata)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      crypto.randomUUID(),
      input.reportId,
      input.userId,
      input.action,
      new Date().toISOString(),
      input.metadata ? JSON.stringify(input.metadata) : null,
    ],
  );
}

export function listAccessLogForReport(reportId: string) {
  return all(`SELECT * FROM report_access_log WHERE report_id = ? ORDER BY occurred_at ASC`, [reportId]);
}

// ---- Shares ------------------------------------------------------------

export function createShare(input: { reportId: string; createdById: string; expiresAt?: string | null }) {
  const id = crypto.randomUUID();
  const token = crypto.randomBytes(24).toString("base64url");
  run(
    `INSERT INTO report_share (id, report_id, token, created_by_id, created_at, expires_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?, NULL)`,
    [id, input.reportId, token, input.createdById, new Date().toISOString(), input.expiresAt ?? null],
  );
  return { id, token };
}

export function getShareByToken(token: string) {
  return one<{ id: string; report_id: string; expires_at: string | null; revoked_at: string | null }>(
    `SELECT id, report_id, expires_at, revoked_at FROM report_share WHERE token = ?`,
    [token],
  );
}

export function revokeShare(id: string): void {
  run(`UPDATE report_share SET revoked_at = ? WHERE id = ?`, [new Date().toISOString(), id]);
}

// ---- Bulk batches --------------------------------------------------------

export function createBulkBatch(input: { orgId: string; requestedById: string; totalCount: number }): string {
  const id = crypto.randomUUID();
  run(`INSERT INTO report_bulk_batch (id, org_id, requested_by_id, created_at, total_count) VALUES (?, ?, ?, ?, ?)`, [
    id,
    input.orgId,
    input.requestedById,
    new Date().toISOString(),
    input.totalCount,
  ]);
  return id;
}

export function getBulkBatchProgress(batchId: string) {
  const rows = all<{ status: string; c: number }>(
    `SELECT status, COUNT(*) as c FROM technical_mastery_report WHERE batch_id = ? GROUP BY status`,
    [batchId],
  );
  const total = one<{ total_count: number }>(`SELECT total_count FROM report_bulk_batch WHERE id = ?`, [batchId]);
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.status] = r.c;
  const completed = counts[ReportLifecycleStatus.COMPLETED] ?? 0;
  const failed = counts[ReportLifecycleStatus.FAILED] ?? 0;
  const processing =
    (counts[ReportLifecycleStatus.GENERATING] ?? 0) + (counts[ReportLifecycleStatus.VALIDATING] ?? 0);
  const totalCount = total?.total_count ?? 0;
  return {
    total: totalCount,
    completed,
    failed,
    processing,
    remaining: Math.max(0, totalCount - completed - failed),
  };
}
