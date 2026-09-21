import { ReportFreshnessStatus, ReportLifecycleStatus } from "../domain/enums";
import type { ReportRow } from "./report-repository";
import { findReusableCompletedReport } from "./report-repository";
import type { ReportType } from "../domain/enums";

/** Brief §45: same student + same source data version + same schema version => reuse instead of regenerating. */
export function findReusableReport(input: {
  studentId: string;
  reportType: ReportType;
  schemaVersion: string;
  sourceDataVersion: number;
}): ReportRow | null {
  return findReusableCompletedReport(input);
}

/**
 * Freshness is a property of "right now," not of the stored artifact
 * (brief §42-43) — this is recomputed on every read against the *current*
 * source data version rather than cached on the row, so a report never
 * silently presents outdated data as current.
 */
export function computeFreshness(report: ReportRow, currentSourceDataVersion: number): ReportFreshnessStatus {
  if (report.status === ReportLifecycleStatus.FAILED) return ReportFreshnessStatus.FAILED;
  if (report.status === ReportLifecycleStatus.CANCELLED) return ReportFreshnessStatus.UNAVAILABLE;
  if (
    report.status === ReportLifecycleStatus.REQUESTED ||
    report.status === ReportLifecycleStatus.QUEUED ||
    report.status === ReportLifecycleStatus.GENERATING ||
    report.status === ReportLifecycleStatus.VALIDATING
  ) {
    return ReportFreshnessStatus.GENERATING;
  }
  // COMPLETED
  return report.sourceDataVersion >= currentSourceDataVersion
    ? ReportFreshnessStatus.UP_TO_DATE
    : ReportFreshnessStatus.STALE;
}
