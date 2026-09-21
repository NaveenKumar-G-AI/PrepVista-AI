import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { ReportType } from "../domain/enums";
import { buildFixtureIntelligencePorts } from "../adapters/fixture-adapters";
import {
  ReportAccessDeniedError,
  assertCanAccessReportContent,
  assertCanBulkGenerate,
} from "../services/access-control";
import { auditReportEvent } from "../services/audit-log";
import { ReportAuditAction } from "../domain/enums";
import {
  createBulkBatch,
  createShare,
  getBulkBatchProgress,
  getReportById,
  getShareByToken,
  revokeShare,
} from "../services/report-repository";
import {
  getReportForViewing,
  getReportHistory,
  getReportStatus,
  refreshReport,
  requestReport,
} from "../services/report-generation-service";
import { renderReportPdf } from "../services/report-export-pdf";
import { enqueue } from "../jobs/queue";
import { createReport, transitionStatus } from "../services/report-repository";
import { ReportLifecycleStatus, REPORT_SCHEMA_VERSION } from "../domain/enums";
import { requireAuth, exportRateLimit, generationRateLimit, bulkRateLimit } from "./middleware";

const ports = buildFixtureIntelligencePorts();

function asyncHandler(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}

/** noUncheckedIndexedAccess makes req.params.x come back as `string | undefined`; this asserts it's present (Express guarantees matched route params exist) without a bare `!` at every call site. */
function param(req: Request, name: string): string {
  const value = req.params[name];
  if (value === undefined) throw new Error(`Missing required route param "${name}"`);
  return value;
}

export const reportsRouter = Router();
reportsRouter.use(requireAuth);

const requestReportSchema = z.object({
  studentId: z.string().min(1),
  reportType: z.nativeEnum(ReportType).optional(),
});

reportsRouter.post(
  "/reports",
  generationRateLimit,
  asyncHandler(async (req, res) => {
    const body = requestReportSchema.parse(req.body);
    const { report, reused } = await requestReport(ports, req.user!, body.studentId, body.reportType);
    res.status(reused ? 200 : 202).json({
      reportId: report.id,
      status: report.status,
      reused,
    });
  }),
);

reportsRouter.get(
  "/reports/:id",
  asyncHandler(async (req, res) => {
    const result = await getReportForViewing(ports, req.user!, param(req, "id"));
    res.json(result);
  }),
);

reportsRouter.get(
  "/reports/:id/status",
  asyncHandler(async (req, res) => {
    const result = await getReportStatus(ports, req.user!, param(req, "id"));
    if (!result) throw new ReportAccessDeniedError();
    res.json(result);
  }),
);

reportsRouter.get(
  "/students/:studentId/reports",
  asyncHandler(async (req, res) => {
    const rows = await getReportHistory(ports, req.user!, param(req, "studentId"));
    res.json(
      rows.map((r) => ({
        reportId: r.id,
        status: r.status,
        sourceDataVersion: r.sourceDataVersion,
        schemaVersion: r.schemaVersion,
        generatedAt: r.generatedAt,
        createdAt: r.createdAt,
      })),
    );
  }),
);

reportsRouter.post(
  "/reports/:id/refresh",
  generationRateLimit,
  asyncHandler(async (req, res) => {
    const report = await refreshReport(ports, req.user!, param(req, "id"));
    res.status(202).json({ reportId: report.id, status: report.status });
  }),
);

reportsRouter.get(
  "/reports/:id/export.pdf",
  exportRateLimit,
  asyncHandler(async (req, res) => {
    const result = await getReportForViewing(ports, req.user!, param(req, "id"));
    if (!result.dto) {
      res.status(409).json({ error: `Report is not ready for export (status: ${result.status}).` });
      return;
    }
    const pdfBuffer = await renderReportPdf(result.dto);
    auditReportEvent(param(req, "id"), req.user!.id, ReportAuditAction.DOWNLOADED);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="technical-mastery-report-${param(req, "id")}.pdf"`);
    res.send(pdfBuffer);
  }),
);

reportsRouter.post(
  "/reports/:id/share",
  asyncHandler(async (req, res) => {
    const report = getReportById(param(req, "id"));
    if (!report) throw new ReportAccessDeniedError();
    // Only someone with content access may mint a share link.
    await assertCanAccessReportContent(ports.identity, req.user!, report);
    const share = createShare({ reportId: report.id, createdById: req.user!.id });
    auditReportEvent(report.id, req.user!.id, ReportAuditAction.SHARED, { shareId: share.id });
    res.status(201).json({ token: share.token });
  }),
);

reportsRouter.post(
  "/shares/:shareId/revoke",
  asyncHandler(async (req, res) => {
    revokeShare(param(req, "shareId"));
    res.status(204).send();
  }),
);

const bulkSchema = z.object({ studentIds: z.array(z.string().min(1)).min(1).max(500) });

reportsRouter.post(
  "/reports/bulk",
  bulkRateLimit,
  asyncHandler(async (req, res) => {
    assertCanBulkGenerate(req.user!);
    const body = bulkSchema.parse(req.body);
    const batchId = createBulkBatch({
      orgId: req.user!.orgId,
      requestedById: req.user!.id,
      totalCount: body.studentIds.length,
    });
    for (const studentId of body.studentIds) {
      const student = await ports.identity.getStudent(studentId);
      if (!student || student.orgId !== req.user!.orgId) continue; // silently skip out-of-tenant IDs
      const sourceDataVersion = await ports.dataVersion.getCurrentSourceDataVersion(studentId);
      let report = createReport({
        studentId,
        orgId: student.orgId,
        reportType: ReportType.STUDENT_TECHNICAL_MASTERY,
        schemaVersion: REPORT_SCHEMA_VERSION,
        sourceDataVersion,
        requestedById: req.user!.id,
        batchId,
      });
      report = transitionStatus(report.id, ReportLifecycleStatus.QUEUED);
      enqueue(report.id);
    }
    res.status(202).json({ batchId });
  }),
);

reportsRouter.get(
  "/reports/bulk/:batchId/progress",
  asyncHandler(async (req, res) => {
    assertCanBulkGenerate(req.user!);
    res.json(getBulkBatchProgress(param(req, "batchId")));
  }),
);

// Centralized error mapping — every denial returns the same generic body regardless of cause (brief §54, §79).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function reportsErrorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (err instanceof ReportAccessDeniedError) {
    res.status(403).json({ error: "Not authorized to access this report." });
    return;
  }
  if (err instanceof z.ZodError) {
    res.status(400).json({ error: "Invalid request.", issues: err.issues.map((i) => i.message) });
    return;
  }
  // eslint-disable-next-line no-console
  console.error(err);
  res.status(500).json({ error: "Internal error." });
}
