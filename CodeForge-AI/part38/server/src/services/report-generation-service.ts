import { ReportAuditAction, ReportLifecycleStatus, ReportType, REPORT_SCHEMA_VERSION } from "../domain/enums";
import type { AuthenticatedUser, CodeForgeIntelligencePorts } from "../ports";
import {
  assertCanAccessReportContent,
  assertCanAccessReportStatus,
  assertCanAccessStudent,
  ReportAccessDeniedError,
} from "./access-control";
import { auditReportEvent } from "./audit-log";
import { collectReportData } from "./report-data-collector";
import { assembleReportDto } from "./report-assembler";
import { generateNarrative } from "./narrative/narrative-service";
import { computeFreshness, findReusableReport } from "./report-cache";
import {
  createReport,
  findActiveReport,
  getReportById,
  listReportsForStudent,
  transitionStatus,
  type ReportRow,
} from "./report-repository";
import { validateReportDto } from "./report-validator";
import { enqueue } from "../jobs/queue";
import type { TechnicalMasteryReportDto } from "../domain/dto";

export interface RequestReportResult {
  report: ReportRow;
  reused: boolean;
}

/**
 * Entry point for "give me a report" — HTTP handler calls this. Honors the
 * cache-reuse rule (§45) and collapses duplicate in-flight requests (§64).
 * Never blocks on generation itself — creates/finds a row and enqueues; the
 * worker (or, in tests, processNext()) does the actual work asynchronously
 * (§13: "do not hold a long-running HTTP request unnecessarily").
 */
export async function requestReport(
  ports: CodeForgeIntelligencePorts,
  user: AuthenticatedUser,
  studentId: string,
  reportType: ReportType = ReportType.STUDENT_TECHNICAL_MASTERY,
): Promise<RequestReportResult> {
  await assertCanAccessStudent(ports.identity, user, studentId);

  const student = await ports.identity.getStudent(studentId);
  if (!student) throw new Error(`Student ${studentId} not found`);

  const sourceDataVersion = await ports.dataVersion.getCurrentSourceDataVersion(studentId);
  const schemaVersion = REPORT_SCHEMA_VERSION;

  const reusable = findReusableReport({ studentId, reportType, schemaVersion, sourceDataVersion });
  if (reusable) return { report: reusable, reused: true };

  const active = findActiveReport({ studentId, reportType, schemaVersion, sourceDataVersion });
  if (active) return { report: active, reused: false };

  let report = createReport({
    studentId,
    orgId: student.orgId,
    reportType,
    schemaVersion,
    sourceDataVersion,
    requestedById: user.id,
  });
  report = transitionStatus(report.id, ReportLifecycleStatus.QUEUED);
  enqueue(report.id);
  return { report, reused: false };
}

/** Explicit regeneration (brief §44) — always creates a new row, even if source data hasn't changed. */
export async function refreshReport(
  ports: CodeForgeIntelligencePorts,
  user: AuthenticatedUser,
  reportId: string,
): Promise<ReportRow> {
  const existing = getReportById(reportId);
  if (!existing) throw new Error("Report not found");
  await assertCanAccessReportContent(ports.identity, user, existing);

  const sourceDataVersion = await ports.dataVersion.getCurrentSourceDataVersion(existing.studentId);
  let report = createReport({
    studentId: existing.studentId,
    orgId: existing.orgId,
    reportType: existing.reportType,
    schemaVersion: existing.schemaVersion,
    sourceDataVersion,
    requestedById: user.id,
  });
  report = transitionStatus(report.id, ReportLifecycleStatus.QUEUED);
  auditReportEvent(existing.id, user.id, ReportAuditAction.REGENERATED, { newReportId: report.id });
  enqueue(report.id);
  return report;
}

/**
 * The actual generation pipeline: Collect -> Assemble -> Narrative ->
 * Validate -> Publish (brief §65). Called by the queue worker, and
 * directly by tests to avoid depending on real timing.
 */
export async function processReportGeneration(
  ports: CodeForgeIntelligencePorts,
  reportId: string,
): Promise<ReportRow> {
  const initial = getReportById(reportId);
  if (!initial) throw new Error(`Report ${reportId} not found`);

  transitionStatus(reportId, ReportLifecycleStatus.GENERATING);

  try {
    const data = await collectReportData(ports, initial.studentId);
    const withoutNarrative = assembleReportDto(data, {
      reportId: initial.id,
      reportType: initial.reportType,
      schemaVersion: initial.schemaVersion,
      generatedById: initial.requestedById,
    });
    const narrative = await generateNarrative(withoutNarrative);
    const fullDto: TechnicalMasteryReportDto = { ...withoutNarrative, narrative };

    transitionStatus(reportId, ReportLifecycleStatus.VALIDATING);
    const validated = validateReportDto(fullDto);

    const completed = transitionStatus(reportId, ReportLifecycleStatus.COMPLETED, {
      dto: validated,
      narrativeSource: narrative.source,
      narrativeValidated: narrative.validated,
    });

    auditReportEvent(completed.id, completed.requestedById, ReportAuditAction.GENERATED);
    return completed;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const current = getReportById(reportId);
    // Only terminal-transition from a state that legally allows FAILED —
    // never silently overwrite a report that already completed.
    if (
      current &&
      (current.status === ReportLifecycleStatus.GENERATING || current.status === ReportLifecycleStatus.VALIDATING)
    ) {
      transitionStatus(reportId, ReportLifecycleStatus.FAILED, { failureReason: message });
    }
    throw err;
  }
}

export interface ViewableReport {
  status: ReportRow["status"];
  freshness: ReturnType<typeof computeFreshness>;
  dto: TechnicalMasteryReportDto | null;
  failureReason: string | null;
}

/** Report content for an end user — brief §46, §54 (denial never distinguishes "not found" from "not yours"). */
export async function getReportForViewing(
  ports: CodeForgeIntelligencePorts,
  user: AuthenticatedUser,
  reportId: string,
): Promise<ViewableReport> {
  const report = getReportById(reportId);
  if (!report) {
    throw new ReportAccessDeniedError();
  }
  await assertCanAccessReportContent(ports.identity, user, report);

  const currentVersion = await ports.dataVersion.getCurrentSourceDataVersion(report.studentId);
  const freshness = computeFreshness(report, currentVersion);

  if (report.status === ReportLifecycleStatus.COMPLETED && report.dto) {
    auditReportEvent(report.id, user.id, ReportAuditAction.VIEWED);
    return { status: report.status, freshness, dto: { ...report.dto, freshness }, failureReason: null };
  }
  return { status: report.status, freshness, dto: null, failureReason: report.failureReason };
}

/** Status-only view — allows ADMIN, per access-control.ts's operational-vs-content split. */
export async function getReportStatus(
  ports: CodeForgeIntelligencePorts,
  user: AuthenticatedUser,
  reportId: string,
): Promise<{ status: ReportRow["status"]; freshness: ReturnType<typeof computeFreshness> } | null> {
  const report = getReportById(reportId);
  if (!report) return null;
  await assertCanAccessReportStatus(ports.identity, user, report);
  const currentVersion = await ports.dataVersion.getCurrentSourceDataVersion(report.studentId);
  return { status: report.status, freshness: computeFreshness(report, currentVersion) };
}

export async function getReportHistory(
  ports: CodeForgeIntelligencePorts,
  user: AuthenticatedUser,
  studentId: string,
): Promise<ReportRow[]> {
  await assertCanAccessStudent(ports.identity, user, studentId);
  return listReportsForStudent(studentId);
}
