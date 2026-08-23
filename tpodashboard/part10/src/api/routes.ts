import { Router, type Request, type Response, type NextFunction } from "express";
import type { Container } from "../container.js";

/**
 * PERMISSIONS NOTE (section 57/58): real authentication/session handling
 * belongs to Parts 1-9. This header-based check is a stand-in so the
 * "recruiters have zero access" boundary (section 1) and per-report
 * visibility rules are enforced somewhere concrete and testable. Replace
 * requireRole with your real auth middleware on integration — every
 * route below only needs `req.prepvistaRole` to be set correctly.
 */
const KNOWN_ROLES = new Set([
  "tpo_head", "placement_officer", "department_coordinator", "faculty", "management", "student",
]);

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      prepvistaRole?: string;
    }
  }
}

function requireRole(...allowed: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = req.header("x-prepvista-role");
    if (!role) {
      return res.status(401).json({
        error: "Missing x-prepvista-role header (stand-in for real auth from Parts 1-9).",
      });
    }
    if (role === "recruiter") {
      return res.status(403).json({ error: "Recruiters have no PrepVista access (spec sections 1 and 57)." });
    }
    if (!KNOWN_ROLES.has(role)) {
      return res.status(403).json({ error: `Unknown role "${role}".` });
    }
    if (allowed.length > 0 && !allowed.includes(role)) {
      return res.status(403).json({ error: `Role "${role}" is not authorized for this report.` });
    }
    req.prepvistaRole = role;
    next();
  };
}

function requireQuery(req: Request, res: Response, keys: string[]): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = req.query[k];
    if (typeof v !== "string" || v.length === 0) {
      res.status(400).json({ error: `Missing required query parameter "${k}".` });
      return null;
    }
    out[k] = v;
  }
  return out;
}

export function buildRouter(container: Container): Router {
  const router = Router();
  const { services, repos } = container;

  // ---- getExecutiveMetrics / generateReportDraft (live, unsaved preview) ----
  router.get(
    "/institutions/:institutionId/executive-report",
    requireRole("tpo_head", "placement_officer", "management"),
    (req, res) => {
      const q = requireQuery(req, res, ["season"]);
      if (!q) return;
      const comparisonSeason = typeof req.query.comparisonSeason === "string" ? req.query.comparisonSeason : undefined;
      try {
        const payload = services.reportGenerationService.buildExecutiveReportPayload(
          req.params.institutionId, q.season, comparisonSeason
        );
        res.json(payload);
      } catch (err) {
        res.status(422).json({ error: (err as Error).message });
      }
    }
  );

  // ---- publish: freeze the above as an immutable, versioned snapshot ----
  router.post(
    "/institutions/:institutionId/executive-report/publish",
    requireRole("tpo_head", "management"),
    (req, res) => {
      const { season, comparisonSeason, generatedBy } = req.body ?? {};
      if (!season || !generatedBy) {
        return res.status(400).json({ error: "Body must include { season, generatedBy }." });
      }
      try {
        const { snapshot } = services.reportGenerationService.publishExecutiveReport(
          req.params.institutionId, season, generatedBy, comparisonSeason
        );
        res.status(201).json(snapshot);
      } catch (err) {
        res.status(422).json({ error: (err as Error).message });
      }
    }
  );

  router.get(
    "/institutions/:institutionId/report-snapshots/:snapshotId",
    requireRole("tpo_head", "placement_officer", "management"),
    (req, res) => {
      const snapshot = repos.snapshots.getById(req.params.snapshotId);
      if (!snapshot || snapshot.institutionId !== req.params.institutionId) {
        return res.status(404).json({ error: "Snapshot not found." });
      }
      res.json(snapshot);
    }
  );

  // ---- getDepartmentReport ----
  router.get(
    "/institutions/:institutionId/departments",
    requireRole("tpo_head", "placement_officer", "department_coordinator", "management"),
    (req, res) => {
      const q = requireQuery(req, res, ["season"]);
      if (!q) return;
      res.json(services.reportingService.getDepartmentPerformance(req.params.institutionId, q.season));
    }
  );

  // ---- getPlacementFunnel ----
  router.get(
    "/institutions/:institutionId/funnel",
    requireRole("tpo_head", "placement_officer", "department_coordinator", "management"),
    (req, res) => {
      const q = requireQuery(req, res, ["season"]);
      if (!q) return;
      const department = typeof req.query.department === "string" ? req.query.department : undefined;
      res.json(services.reportingService.getExecutiveFunnel(req.params.institutionId, q.season, department));
    }
  );

  // ---- company/recruiter report — TPO/management ONLY (section 16) ----
  router.get(
    "/institutions/:institutionId/companies",
    requireRole("tpo_head", "placement_officer", "management"),
    (req, res) => {
      const q = requireQuery(req, res, ["season"]);
      if (!q) return;
      const comparisonSeason = typeof req.query.comparisonSeason === "string" ? req.query.comparisonSeason : undefined;
      res.json(services.reportingService.getCompanyReport(req.params.institutionId, q.season, comparisonSeason));
    }
  );

  // ---- getMetricDefinition + computed value ----
  router.get(
    "/institutions/:institutionId/metrics/:metricName",
    requireRole("tpo_head", "placement_officer", "department_coordinator", "management"),
    (req, res) => {
      const q = requireQuery(req, res, ["season"]);
      if (!q) return;
      const department = typeof req.query.department === "string" ? req.query.department : undefined;
      try {
        res.json(services.metricService.compute(req.params.institutionId, req.params.metricName, q.season, department));
      } catch (err) {
        res.status(422).json({ error: (err as Error).message });
      }
    }
  );

  // ---- getReportWarnings (+ data quality score) ----
  router.get(
    "/institutions/:institutionId/warnings",
    requireRole("tpo_head", "placement_officer", "management"),
    (req, res) => {
      const q = requireQuery(req, res, ["season"]);
      if (!q) return;
      const { warnings, integrityIssues } = services.dataQualityService.getWarningsAndIssues(req.params.institutionId, q.season);
      const quality = services.dataQualityService.computeQualityScore(req.params.institutionId, q.season);
      res.json({ warnings, integrityIssues, quality });
    }
  );

  // ---- getEvidence ----
  router.get(
    "/institutions/:institutionId/evidence/:entityType/:entityId",
    requireRole("tpo_head", "placement_officer", "management"),
    (req, res) => {
      res.json(services.evidenceService.forEntity(req.params.entityType, req.params.entityId));
    }
  );

  router.post(
    "/institutions/:institutionId/evidence/:evidenceId/verify",
    requireRole("tpo_head", "placement_officer"),
    (req, res) => {
      const { verifiedBy } = req.body ?? {};
      if (!verifiedBy) return res.status(400).json({ error: "Body must include { verifiedBy }." });
      const result = services.evidenceService.verify(req.params.evidenceId, verifiedBy);
      if (!result) return res.status(404).json({ error: "Evidence record not found." });
      res.json(result);
    }
  );

  return router;
}
