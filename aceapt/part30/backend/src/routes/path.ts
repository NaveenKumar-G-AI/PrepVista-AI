import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { withTenant } from "../db/pool.js";
import * as repo from "../db/repository.js";
import { getDashboard } from "../engine/dashboard.js";
import { recalculatePath } from "../engine/orchestrator.js";
import { compareTargets } from "../engine/targetSwitch.js";
import { applyEvidence } from "../engine/capabilityModel.js";
import { diagnoseFailure } from "../engine/failureAnalysis.js";
import { requestProof } from "../integrations/proofClient.js";
import { pathEventBus, type PathEventType } from "../events/eventBus.js";
import { explain } from "../ai/explanationAdapter.js";
import type { EvidenceResult, EvidenceType } from "../domain/types.js";

export const pathRouter = Router();

// Express 4 does not forward a rejected promise from an async handler to
// the error middleware on its own -- every route below goes through
// asyncHandler so a thrown/rejected error reaches app.use's error handler
// (Section 54) instead of crashing the process. See middleware/asyncHandler.ts.
const get = (path: string, handler: (req: Request, res: Response) => Promise<unknown>) => pathRouter.get(path, asyncHandler(handler));
const post = (path: string, handler: (req: Request, res: Response) => Promise<unknown>) => pathRouter.post(path, asyncHandler(handler));

const ACTION_TO_EVIDENCE_TYPE: Record<string, EvidenceType> = {
  LEARN: "LEARNING",
  REVISE: "LEARNING",
  REFLECT: "LEARNING",
  PRACTICE: "PRACTICE",
  RETEST: "PRACTICE",
  SIMULATE: "PERFORMANCE",
  TRANSFER: "TRANSFER",
};

function targetIdFromQuery(req: import("express").Request): string | undefined {
  const t = req.query.targetId;
  return typeof t === "string" ? t : undefined;
}

async function resolveTargetId(tenantId: string, studentId: string, explicitTargetId?: string): Promise<string | null> {
  if (explicitTargetId) return explicitTargetId;
  return withTenant(tenantId, async (client) => {
    const active = await repo.getActivePathForStudent(client, studentId);
    return active?.targetId ?? null;
  });
}

// ---------------------------------------------------------------------------
// GET /api/path/current
// ---------------------------------------------------------------------------
get("/current", async (req, res) => {
  const targetId = await resolveTargetId(req.tenantId, req.studentId, targetIdFromQuery(req));
  if (!targetId) {
    // Section 52: EMPTY STATES.
    res.json({ empty: true, message: "Your path starts with a target.", detail: "ACEAPT needs a target to build your personalized readiness path.", action: "EXPLORE_TARGETS" });
    return;
  }
  const dashboard = await withTenant(req.tenantId, (client) => getDashboard(client, req.studentId, targetId));
  if (!dashboard) {
    res.status(404).json({ error: "No path yet for this target. POST /api/path/target to start one." });
    return;
  }
  res.json(dashboard);
});

// ---------------------------------------------------------------------------
// GET /api/path/milestones
// ---------------------------------------------------------------------------
get("/milestones", async (req, res) => {
  const targetId = await resolveTargetId(req.tenantId, req.studentId, targetIdFromQuery(req));
  if (!targetId) {
    res.json({ empty: true, message: "Your path starts with a target." });
    return;
  }
  const dashboard = await withTenant(req.tenantId, (client) => getDashboard(client, req.studentId, targetId));
  if (!dashboard) {
    res.status(404).json({ error: "No path yet for this target." });
    return;
  }
  res.json({ stages: dashboard.stages, milestones: dashboard.milestones });
});

// ---------------------------------------------------------------------------
// GET /api/path/today -- Section 22
// ---------------------------------------------------------------------------
get("/today", async (req, res) => {
  const targetId = await resolveTargetId(req.tenantId, req.studentId, targetIdFromQuery(req));
  if (!targetId) {
    res.json({ empty: true, message: "Your path starts with a target." });
    return;
  }
  const dashboard = await withTenant(req.tenantId, (client) => getDashboard(client, req.studentId, targetId));
  if (!dashboard) {
    res.status(404).json({ error: "No path yet for this target." });
    return;
  }
  const narrativeFallback = dashboard.nextBestAction
    ? dashboard.nextBestAction.headline
    : dashboard.evidenceCoverage < 0.3
      ? "We need more evidence before today's plan can be reliable -- complete a targeted assessment."
      : "No open action right now -- your current evidence already meets what's required.";
  const narrative = await explain({
    kind: "next_action",
    facts: { nextBestAction: dashboard.nextBestAction, bottleneck: dashboard.bottleneck, evidenceCoverage: dashboard.evidenceCoverage },
    fallbackText: narrativeFallback,
  });
  res.json({ actions: dashboard.nextBestAction ? [dashboard.nextBestAction] : [], narrative });
});

// ---------------------------------------------------------------------------
// GET /api/path/risks
// ---------------------------------------------------------------------------
get("/risks", async (req, res) => {
  const targetId = await resolveTargetId(req.tenantId, req.studentId, targetIdFromQuery(req));
  if (!targetId) {
    res.json({ empty: true, risks: [] });
    return;
  }
  const dashboard = await withTenant(req.tenantId, (client) => getDashboard(client, req.studentId, targetId));
  if (!dashboard) {
    res.status(404).json({ error: "No path yet for this target." });
    return;
  }
  res.json({ risks: dashboard.activeRisks });
});

// ---------------------------------------------------------------------------
// GET /api/path/history -- Section 25
// ---------------------------------------------------------------------------
get("/history", async (req, res) => {
  const targetId = await resolveTargetId(req.tenantId, req.studentId, targetIdFromQuery(req));
  if (!targetId) {
    res.json({ empty: true, snapshots: [], events: [] });
    return;
  }
  const result = await withTenant(req.tenantId, async (client) => {
    const pathRow = await repo.getPathByStudentAndTarget(client, req.studentId, targetId);
    if (!pathRow) return null;
    const snapshots = await repo.getSnapshots(client, pathRow.id);
    const { rows: events } = await client.query(
      `SELECT event_type AS "eventType", reason, summary, created_at AS "createdAt"
       FROM path_events WHERE path_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [pathRow.id]
    );
    return { snapshots, events };
  });
  if (!result) {
    res.status(404).json({ error: "No path yet for this target." });
    return;
  }
  res.json(result);
});

// ---------------------------------------------------------------------------
// GET /api/path/weekly-review -- Section 24
// ---------------------------------------------------------------------------
get("/weekly-review", async (req, res) => {
  const targetId = await resolveTargetId(req.tenantId, req.studentId, targetIdFromQuery(req));
  if (!targetId) {
    res.json({ empty: true });
    return;
  }
  const result = await withTenant(req.tenantId, async (client) => {
    const pathRow = await repo.getPathByStudentAndTarget(client, req.studentId, targetId);
    if (!pathRow) return null;
    const snapshots = await repo.getSnapshots(client, pathRow.id);
    const weekAgo = Date.now() - 7 * 86400000;
    const before = [...snapshots].reverse().find((s) => new Date(s.takenAt).getTime() <= weekAgo);
    const capabilityDelta = null; // capability-dimension history isn't snapshotted separately in this reference build -- see README
    const readinessDelta = before ? pathRow.readiness - before.readiness : null;
    const { rows: verifiedRows } = await client.query(
      `SELECT count(*)::int AS n FROM path_milestones WHERE path_id = $1 AND verified_at >= $2`,
      [pathRow.id, new Date(weekAgo).toISOString()]
    );
    const dashboard = await getDashboard(client, req.studentId, targetId);
    return {
      weekStart: new Date(weekAgo).toISOString(),
      weekEnd: new Date().toISOString(),
      readinessDelta,
      capabilityDelta,
      milestonesVerified: verifiedRows[0]?.n ?? 0,
      bottleneck: dashboard?.bottleneck?.capabilityName ?? null,
      nextFocus: dashboard?.nextBestAction?.headline ?? "No open focus area right now.",
    };
  });
  if (!result) {
    res.status(404).json({ error: "No path yet for this target." });
    return;
  }
  res.json(result);
});

// ---------------------------------------------------------------------------
// POST /api/path/target -- select/switch/add a target (Sections 28-29, 52)
// ---------------------------------------------------------------------------
const TargetBody = z.object({
  targetId: z.string().uuid(),
  slot: z.enum(["PRIMARY", "SECONDARY", "STRETCH"]).default("PRIMARY"),
  deadlineDays: z.number().int().positive().nullable().optional(),
});

post("/target", async (req, res) => {
  const parsed = TargetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { targetId, slot, deadlineDays } = parsed.data;

  const result = await withTenant(req.tenantId, async (client) => {
    const target = await repo.getTarget(client, targetId);
    if (!target) return { notFound: true as const };

    let comparison = null;
    if (slot === "PRIMARY") {
      const priorPrimary = await repo.getActivePathForStudent(client, req.studentId);
      if (priorPrimary && priorPrimary.targetId !== targetId) {
        const oldReqs = await repo.getTargetRequirements(client, priorPrimary.targetId);
        const newReqs = await repo.getTargetRequirements(client, targetId);
        const states = await repo.getStudentCapabilityStates(client, req.studentId);
        comparison = compareTargets(oldReqs, newReqs, states);
        await client.query(`UPDATE paths SET slot = 'SECONDARY' WHERE id = $1`, [priorPrimary.id]);
      }
    }

    let existingId: string;
    let isNew = false;
    const existing = await repo.getPathByStudentAndTarget(client, req.studentId, targetId);
    if (!existing) {
      isNew = true;
      existingId = await repo.createPath(client, {
        tenantId: req.tenantId,
        studentId: req.studentId,
        targetId,
        slot,
        deadlineDays: deadlineDays ?? null,
        mode: "STANDARD",
        targetReadiness: 90,
      });
    } else {
      existingId = existing.id;
      if (slot !== existing.slot || (deadlineDays !== undefined && deadlineDays !== existing.deadlineDays)) {
        await client.query(`UPDATE paths SET slot = $1, deadline_days = $2 WHERE id = $3`, [slot, deadlineDays ?? existing.deadlineDays, existing.id]);
      }
    }

    await recalculatePath(client, req.tenantId, existingId, isNew ? "INITIAL_GENERATION" : "TARGET_CHANGED");
    const dashboard = await getDashboard(client, req.studentId, targetId);
    return { dashboard, comparison };
  });

  if ("notFound" in result) {
    res.status(404).json({ error: "target not found" });
    return;
  }
  res.json(result);
});

// ---------------------------------------------------------------------------
// POST /api/path/recalculate -- Section 46
// ---------------------------------------------------------------------------
const RecalculateBody = z.object({
  targetId: z.string().uuid(),
  reason: z.enum(["MANUAL_RECALCULATION", "DEADLINE_CHANGED", "PERFORMANCE_DECLINE"]).default("MANUAL_RECALCULATION"),
});

post("/recalculate", async (req, res) => {
  const parsed = RecalculateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const result = await withTenant(req.tenantId, async (client) => {
    const pathRow = await repo.getPathByStudentAndTarget(client, req.studentId, parsed.data.targetId);
    if (!pathRow) return null;
    await recalculatePath(client, req.tenantId, pathRow.id, parsed.data.reason);
    return getDashboard(client, req.studentId, parsed.data.targetId);
  });
  if (!result) {
    res.status(404).json({ error: "No path yet for this target." });
    return;
  }
  res.json(result);
});

// ---------------------------------------------------------------------------
// POST /api/path/actions/:actionId/complete -- Section 3's core loop, closed end to end
// ---------------------------------------------------------------------------
const CompleteBody = z.object({
  result: z.object({
    correct: z.number().int().nonnegative().optional(),
    total: z.number().int().positive().optional(),
    timeTakenSeconds: z.number().positive().optional(),
    timeAllowedSeconds: z.number().positive().optional(),
    passed: z.boolean().optional(),
    contextNovelty: z.enum(["SEEN", "NOVEL"]).optional(),
  }),
  source: z.string().default("path.action_complete"),
});

post("/actions/:actionId/complete", async (req, res) => {
  const parsed = CompleteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { actionId } = req.params;

  const result = await withTenant(req.tenantId, async (client) => {
    const action = await repo.getActionById(client, actionId);
    if (!action || action.studentId !== req.studentId) return { notFound: true as const };
    if (action.status !== "PENDING" && action.status !== "ACTIVE") return { alreadyClosed: true as const };
    // A PROVE action has no evidence result of its own to record -- it is
    // resolved by the dedicated prove endpoint (Section 35), which calls
    // PROOF and only marks VERIFIED if PROOF actually grants it. Accepting
    // it here too would silently no-op the "evidence" and just loop: the
    // milestone stays unverified, so the very next recalculation would
    // regenerate the identical PROVE suggestion.
    if (action.type === "PROVE" && action.milestoneId) {
      return { wrongEndpoint: true as const, milestoneId: action.milestoneId };
    }

    const priorStates = await repo.getStudentCapabilityStates(client, req.studentId);
    const priorState = priorStates.find((s) => s.capabilityCode === action.capabilityCode) ?? null;
    const evidenceResult: EvidenceResult = parsed.data.result;

    let diagnosis = null;
    if (evidenceResult.passed === false) {
      diagnosis = diagnoseFailure(evidenceResult, priorState);
    }

    if (action.type !== "PROVE" && action.type !== "REFLECT") {
      const evidenceType = ACTION_TO_EVIDENCE_TYPE[action.type] ?? "PRACTICE";
      const nextState = applyEvidence(priorState, req.studentId, action.capabilityCode, evidenceType, evidenceResult);
      await repo.upsertCapabilityState(client, nextState);
      await repo.insertEvidenceEvent(client, {
        studentId: req.studentId,
        capabilityCode: action.capabilityCode,
        type: evidenceType,
        source: parsed.data.source,
        result: evidenceResult,
        occurredAt: new Date().toISOString(),
      });
    }

    await repo.completeAction(client, actionId);
    await recalculatePath(client, req.tenantId, action.pathId, "CAPABILITY_CHANGED");

    const pathRow = await client.query(`SELECT target_id AS "targetId" FROM paths WHERE id = $1`, [action.pathId]);
    const dashboard = await getDashboard(client, req.studentId, pathRow.rows[0].targetId);

    let diagnosisExplanation: string | null = null;
    if (diagnosis) {
      diagnosisExplanation = await explain({ kind: "risk", facts: { cause: diagnosis.cause }, fallbackText: diagnosis.explanation });
    }

    return { dashboard, diagnosis: diagnosis ? { cause: diagnosis.cause, explanation: diagnosisExplanation } : null };
  });

  if ("notFound" in result) {
    res.status(404).json({ error: "action not found" });
    return;
  }
  if ("wrongEndpoint" in result) {
    res.status(400).json({ error: "This is a PROVE action -- complete it via POST /api/path/milestones/:milestoneId/prove instead.", milestoneId: result.milestoneId });
    return;
  }
  if ("alreadyClosed" in result) {
    res.status(409).json({ error: "action is no longer open" });
    return;
  }
  res.json(result);
});

// ---------------------------------------------------------------------------
// POST /api/path/actions/:actionId/skip -- Sections 32, 34
// ---------------------------------------------------------------------------
post("/actions/:actionId/skip", async (req, res) => {
  const { actionId } = req.params;
  const result = await withTenant(req.tenantId, async (client) => {
    const action = await repo.getActionById(client, actionId);
    if (!action || action.studentId !== req.studentId) return { notFound: true as const };

    if (action.milestoneId) {
      const { rows } = await client.query(`SELECT critical, name FROM path_milestones WHERE id = $1`, [action.milestoneId]);
      if (rows[0]?.critical) {
        return {
          blocked: true as const,
          message: "This milestone is currently required for verified readiness.",
        };
      }
    }

    const skipped = await repo.skipAction(client, actionId);
    if (!skipped) return { alreadyClosed: true as const };

    const consequenceFallback = "You can skip this step, but doing so may reduce the evidence supporting your target readiness.";
    const consequence = await explain({
      kind: "skip_consequence",
      facts: { actionType: action.type, capabilityCode: action.capabilityCode },
      fallbackText: consequenceFallback,
    });

    await recalculatePath(client, req.tenantId, action.pathId, "MANUAL_RECALCULATION");
    const pathRow = await client.query(`SELECT target_id AS "targetId" FROM paths WHERE id = $1`, [action.pathId]);
    const dashboard = await getDashboard(client, req.studentId, pathRow.rows[0].targetId);
    return { dashboard, consequence };
  });

  if ("notFound" in result) {
    res.status(404).json({ error: "action not found" });
    return;
  }
  if ("blocked" in result) {
    res.status(409).json({ error: result.message });
    return;
  }
  if ("alreadyClosed" in result) {
    res.status(409).json({ error: "action is no longer open" });
    return;
  }
  res.json(result);
});

// ---------------------------------------------------------------------------
// POST /api/path/milestones/:milestoneId/prove -- Section 35
// ---------------------------------------------------------------------------
post("/milestones/:milestoneId/prove", async (req, res) => {
  const { milestoneId } = req.params;
  const result = await withTenant(req.tenantId, async (client) => {
    const { rows } = await client.query(
      `SELECT m.id, m.path_id AS "pathId", m.name, m.evidence_requirements AS "evidenceRequirements", m.status,
              p.student_id AS "studentId", p.target_id AS "targetId"
       FROM path_milestones m JOIN paths p ON p.id = m.path_id WHERE m.id = $1`,
      [milestoneId]
    );
    const milestone = rows[0];
    if (!milestone || milestone.studentId !== req.studentId) return { notFound: true as const };

    const states = await repo.getStudentCapabilityStates(client, req.studentId);
    const requirements: Array<{ capabilityCode: string; dimension: string; minValue: number }> = milestone.evidenceRequirements;
    const primary = requirements[0];
    const state = states.find((s) => s.capabilityCode === primary.capabilityCode);
    const currentValue = state ? (primary.dimension === "level" ? state.level : (state as unknown as Record<string, number>)[primary.dimension]) : 0;

    const proof = await requestProof(primary.capabilityCode, currentValue, primary.minValue);
    if (proof.passed) {
      await repo.updateMilestoneStatus(client, milestoneId, "VERIFIED", new Date().toISOString());
    }
    await recalculatePath(client, req.tenantId, milestone.pathId, "PROOF_COMPLETED");
    const dashboard = await getDashboard(client, req.studentId, milestone.targetId);
    return { dashboard, proof };
  });

  if ("notFound" in result) {
    res.status(404).json({ error: "milestone not found" });
    return;
  }
  res.json(result);
});

// ---------------------------------------------------------------------------
// POST /api/path/events/upstream -- simulates a webhook from ALIGN/ADAPT/FORECAST/PROOF (Section 47)
// ---------------------------------------------------------------------------
const UpstreamEventBody = z.object({
  pathId: z.string().uuid(),
  eventType: z.enum(["ASSESSMENT_COMPLETED", "ADAPTATION_COMPLETED", "FORECAST_UPDATED", "PROOF_COMPLETED", "DEADLINE_CHANGED"]),
  payload: z.record(z.unknown()).optional(),
});

post("/events/upstream", async (req, res) => {
  const parsed = UpstreamEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  // Fire-and-forget, matching a real webhook consumer: acknowledge receipt
  // immediately, let the event bus's own drain loop process it (Section 47).
  pathEventBus.enqueue({
    tenantId: req.tenantId,
    pathId: parsed.data.pathId,
    type: parsed.data.eventType as PathEventType,
    payload: parsed.data.payload,
  });
  res.status(202).json({ accepted: true });
});
