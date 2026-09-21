import { Router } from "express";
import type { GrowthService } from "../../lib/growth/service.ts";
import type { GrowthRepository } from "../../lib/growth/persistence/repository.ts";
import { resolveAuthorizedStudentId, applyAssessmentModeFilter, redactSnapshotForAssessment } from "../../lib/growth/authorization.ts";
import type { GrowthDimension, RoleGrowthProfile, TimeWindowPreset } from "../../lib/growth/types.ts";
import { TIME_WINDOW_PRESETS } from "../../lib/growth/types.ts";

const naiveRateLimits = new Map<string, number[]>();
function rateLimited(key: string, maxPerMinute: number): boolean {
  const now = Date.now();
  const hits = (naiveRateLimits.get(key) ?? []).filter((t) => now - t < 60_000);
  hits.push(now);
  naiveRateLimits.set(key, hits);
  return hits.length > maxPerMinute;
  // NOTE: in-memory and per-process — a stand-in for this reference build
  // only. Wire this to CodeForge's existing rate-limiting infrastructure
  // (spec: "reuse existing rate-limiting infrastructure where available")
  // before deploying; this will not work correctly across multiple
  // server instances.
}

function parsePreset(raw: unknown): TimeWindowPreset {
  return typeof raw === "string" && (TIME_WINDOW_PRESETS as readonly string[]).includes(raw) ? (raw as TimeWindowPreset) : "RECENT_90D";
}

export function createGrowthRouter(deps: {
  service: GrowthService;
  repo: GrowthRepository;
  resolveRoleProfile: (studentId: string) => Promise<RoleGrowthProfile | null>;
}) {
  const router = Router();

  router.use(async (req, res, next) => {
    const requestedStudentId = typeof req.query.studentId === "string" ? req.query.studentId : null;
    const auth = resolveAuthorizedStudentId(
      req.session,
      requestedStudentId,
      // Synchronous shape required by the pure authorization function;
      // real instructor checks are async (DB-backed), so we resolve them
      // up front for the one requested student id before calling in.
      (instructorId, studentId) => req.app.locals.enrollmentCache?.[`${instructorId}:${studentId}`] === true,
    );

    if (!auth.ok && auth.reason === "FORBIDDEN" && req.session?.isInstructor && requestedStudentId) {
      // Slow path: the sync cache above missed, do the real async check
      // once, cache it for the rest of this request pipeline.
      const authorized = await deps.repo.isAuthorizedInstructor(req.session.userId, requestedStudentId);
      req.app.locals.enrollmentCache = { ...(req.app.locals.enrollmentCache ?? {}), [`${req.session.userId}:${requestedStudentId}`]: authorized };
      if (authorized) {
        req.growthAuth = { studentId: requestedStudentId, asInstructor: true };
        return next();
      }
    }

    if (!auth.ok) {
      return res.status(auth.reason === "UNAUTHENTICATED" ? 401 : 403).json({ error: auth.reason });
    }
    req.growthAuth = { studentId: auth.studentId, asInstructor: auth.asInstructor };
    next();
  });

  router.get("/overview", async (req, res) => {
    const { studentId } = req.growthAuth!;
    const preset = parsePreset(req.query.window);
    const roleProfile = await deps.resolveRoleProfile(studentId);
    const assessmentMode = req.query.mode === "assessment";
    const snapshot = await deps.service.getGrowthOverview(studentId, preset, roleProfile);
    res.json(assessmentMode ? redactSnapshotForAssessment(snapshot) : snapshot);
  });

  router.get("/timeline", async (req, res) => {
    const { studentId } = req.growthAuth!;
    const preset = parsePreset(req.query.window);
    res.json(await deps.service.getGrowthTimeline(studentId, preset));
  });

  router.get("/trajectory", async (req, res) => {
    const { studentId } = req.growthAuth!;
    const dimension = req.query.dimension as GrowthDimension | undefined;
    if (!dimension) return res.status(400).json({ error: "dimension query param required" });
    const preset = parsePreset(req.query.window);
    res.json(await deps.service.getSkillTrajectory(studentId, dimension, preset));
  });

  router.get("/evidence", async (req, res) => {
    const { studentId, asInstructor } = req.growthAuth!;
    if (req.query.mode === "assessment") return res.status(403).json({ error: "evidence drill-down is unavailable during an active assessment" });
    const dimension = req.query.dimension as GrowthDimension | undefined;
    if (!dimension) return res.status(400).json({ error: "dimension query param required" });
    const evidence = await deps.service.getGrowthEvidence(studentId, dimension);
    // Instructors see the same evidence rows students do, minus raw
    // free-text context that could contain incidental student writing —
    // keep only structured fields.
    res.json(asInstructor ? evidence.map(({ context, ...rest }) => rest) : evidence);
  });

  router.get("/milestones", async (req, res) => {
    const { studentId } = req.growthAuth!;
    res.json(await deps.service.getGrowthMilestones(studentId));
  });

  router.get("/insights", async (req, res) => {
    const { studentId } = req.growthAuth!;
    const roleProfile = await deps.resolveRoleProfile(studentId);
    const insights = await deps.service.getGrowthInsights(studentId, roleProfile);
    res.json(req.query.mode === "assessment" ? applyAssessmentModeFilter(insights) : insights);
  });

  router.get("/summary", async (req, res) => {
    const { studentId } = req.growthAuth!;
    const roleProfile = await deps.resolveRoleProfile(studentId);
    const insights = await deps.service.getGrowthInsights(studentId, roleProfile);
    const visible = req.query.mode === "assessment" ? applyAssessmentModeFilter(insights) : insights;
    const top = visible.filter((i) => i.insightType === "IMPROVEMENT" || i.insightType === "TRANSFER_GAIN").slice(0, 2);
    const developing = visible.filter((i) => i.insightType === "DEVELOPMENT_AREA" || i.insightType === "STAGNATION").slice(0, 1);
    res.json({
      studentId,
      strengths: top.map((i) => i.claim),
      developmentAreas: developing.map((i) => i.claim),
      generatedFrom: visible.length,
    });
  });

  router.get("/snapshot", async (req, res) => {
    const { studentId } = req.growthAuth!;
    const assessmentMode = req.query.mode === "assessment";
    const snapshot = await deps.service.getGrowthSnapshot(studentId);
    if (!snapshot) return res.status(404).json({ error: "no snapshot yet — growth profile is still being established" });
    res.json(assessmentMode ? redactSnapshotForAssessment(snapshot) : snapshot);
  });

  router.post("/recompute", async (req, res) => {
    const { studentId, asInstructor } = req.growthAuth!;
    if (asInstructor) return res.status(403).json({ error: "instructors cannot trigger recomputation" });
    if (rateLimited(`recompute:${studentId}`, 5)) return res.status(429).json({ error: "too many recompute requests" });
    const roleProfile = await deps.resolveRoleProfile(studentId);
    const snapshot = await deps.service.recomputeGrowth(studentId, roleProfile, "student-model@dev", "skill-model@dev");
    res.status(201).json(snapshot);
  });

  return router;
}

declare module "express-serve-static-core" {
  interface Request {
    growthAuth?: { studentId: string; asInstructor: boolean };
  }
}
