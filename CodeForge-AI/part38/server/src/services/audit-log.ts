import { ReportAuditAction } from "../domain/enums";
import { insertAccessLog, listAccessLogForReport } from "./report-repository";

export function auditReportEvent(
  reportId: string,
  userId: string,
  action: ReportAuditAction,
  metadata?: Record<string, unknown>,
): void {
  insertAccessLog({ reportId, userId, action, metadata });
}

export function getReportAuditTrail(reportId: string) {
  return listAccessLogForReport(reportId);
}
