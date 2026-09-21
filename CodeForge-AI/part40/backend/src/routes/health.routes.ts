import { Router } from "express";
import { z } from "zod";
import { requirePermission } from "../middleware/authorize";
import { validateRequest } from "../middleware/inputValidation";
import { asyncRoute } from "../middleware/errorHandler";
import { checkLiveness, checkReadiness, checkDependencyHealth, snapshotAndPersist, getRecentSnapshots } from "../reliability/health.service";

/**
 * HEALTH CHECKS
 * -----------------------------------------------------------------------
 * `publicHealthRouter` is mounted in app.ts BEFORE identity/auth
 * middleware, matching standard infra-probe expectations (a load
 * balancer or orchestrator checking /health/live must not need a bearer
 * token) — and matching "health endpoints must remain lightweight":
 * liveness touches nothing, readiness only checks ESSENTIAL dependencies.
 *
 * `healthRouter` is the authenticated, detailed view for the reliability
 * dashboard — full per-dependency status/latency/error detail is
 * internal infrastructure information (OUTPUT SECURITY) and requires
 * service_health:read:platform, not a public probe.
 */

export const publicHealthRouter = Router();

publicHealthRouter.get("/live", (_req, res) => {
  res.json(checkLiveness());
});

publicHealthRouter.get(
  "/ready",
  asyncRoute(async (_req, res) => {
    const { ready, report } = await checkReadiness();
    // Deliberately minimal body for the public probe — status only, no
    // per-dependency error strings (those live behind the authenticated route below).
    res.status(ready ? 200 : 503).json({ ready, overall: report.overall });
  })
);

export const healthRouter = Router();

healthRouter.get(
  "/dependencies",
  requirePermission("service_health:read:platform"),
  asyncRoute(async (_req, res) => {
    const report = await checkDependencyHealth();
    // Best-effort trend persistence; never blocks or fails this response.
    snapshotAndPersist(report).catch(() => void 0);
    res.json(report);
  })
);

healthRouter.get(
  "/dependencies/:service/history",
  requirePermission("service_health:read:platform"),
  validateRequest({
    params: z.object({ service: z.string().min(1).max(100) }),
    query: z.object({ limit: z.coerce.number().int().min(1).max(500).default(50) })
  }),
  asyncRoute(async (req, res) => {
    const q = req.query as unknown as { limit: number };
    const snapshots = await getRecentSnapshots(req.params.service!, q.limit);
    res.json({ snapshots });
  })
);
