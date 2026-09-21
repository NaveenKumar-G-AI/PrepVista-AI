import type { PoolClient } from "pg";
import type {
  Bottleneck,
  PathChangeExplanation,
  PathChangeReason,
  PathMilestone,
  PathMode,
  PathStage,
} from "../domain/types.js";
import * as repo from "../db/repository.js";
import { computeGaps } from "./gapAnalysis.js";
import { identifyBottleneck } from "./bottleneck.js";
import { calculateReadiness, calculateReadinessDimensions } from "./readiness.js";
import { evaluateUnlockedMilestone, checkForMastery, type MilestoneEvaluation } from "./milestoneEvidence.js";
import { determineNextBestAction } from "./nextBestAction.js";
import { detectRisks, type RiskInput } from "./riskEngine.js";
import { selectMode } from "./pathModes.js";
import { formatProjection } from "./projection.js";
import { getForecastProjection } from "../integrations/forecastClient.js";
import { DEFAULT_TEMPLATE, generateMilestones, resolveTemplate } from "./pathGenerator.js";

export interface RecalculationResult {
  bottleneck: Bottleneck | null;
  readiness: number;
  mode: PathMode;
  stages: PathStage[];
  milestones: PathMilestone[];
  changeExplanation: PathChangeExplanation | null;
}

/**
 * Section 3's core loop, condensed into one call: load current evidence,
 * recompute gaps/bottleneck/readiness/milestone status/risks/mode, decide
 * what changed and why, persist it, and leave a snapshot + an explanatory
 * event behind. Every entry point that can change a student's evidence or
 * target -- initial generation, completing an action, an upstream
 * Assessment/Adaptation/Proof/Forecast event, a target or deadline change
 * -- funnels through this single function so "recalculate" always means
 * the same thing (Section 16).
 *
 * Section 15 (success-aware path) is deliberately NOT special-cased here:
 * because bottleneck/next-best-action are always recomputed fresh from
 * current evidence rather than incrementally patched, a capability that
 * just cleared its bar simply stops being the bottleneck on the next
 * pass and a new one surfaces. There is no separate "handle success" code
 * path to keep in sync with this one.
 */
export async function recalculatePath(
  client: PoolClient,
  tenantId: string,
  pathId: string,
  reason: PathChangeReason
): Promise<RecalculationResult> {
  const pathRows = await client.query(
    `SELECT id, student_id AS "studentId", target_id AS "targetId", mode, readiness, target_readiness AS "targetReadiness",
            current_bottleneck AS "currentBottleneckCode", deadline_days AS "deadlineDays"
     FROM paths WHERE id = $1`,
    [pathId]
  );
  const path = pathRows.rows[0];
  if (!path) throw new Error(`recalculatePath: path ${pathId} not found`);

  const target = await repo.getTarget(client, path.targetId);
  if (!target) throw new Error(`recalculatePath: target ${path.targetId} not found`);

  // Sequential, not Promise.all: these all share one pg client (the tenant-
  // scoped transaction from withTenant), and a single connection can only
  // run one query at a time -- firing them concurrently is silently
  // invalid (Node logs a deprecation warning and future pg versions will
  // reject it outright).
  const requirements = await repo.getTargetRequirements(client, path.targetId);
  const allCapabilities = await repo.getCapabilities(client);
  const states = await repo.getStudentCapabilityStates(client, path.studentId);
  const capabilities = allCapabilities.filter((c) => requirements.some((r) => r.capabilityCode === c.code));

  // 1) Ensure structure exists (Section 9-10: generated once from the target, then persisted).
  let stages = await repo.getStages(client, pathId);
  let milestones = await repo.getMilestones(client, pathId);
  if (stages.length === 0) {
    const template = resolveTemplate(target.code) ?? DEFAULT_TEMPLATE;
    for (const s of template.stages) {
      const id = await repo.insertStage(client, tenantId, {
        pathId,
        key: s.key,
        name: s.name,
        sequence: s.sequence,
        status: s.sequence === 1 ? "ACTIVE" : "LOCKED",
      });
      stages.push({ id, pathId, key: s.key, name: s.name, sequence: s.sequence, status: s.sequence === 1 ? "ACTIVE" : "LOCKED" });
    }
    const generated = generateMilestones(template, requirements, capabilities);
    for (const m of generated) {
      const stage = stages.find((s) => s.key === m.stageKey)!;
      const id = await repo.insertMilestone(client, tenantId, {
        pathId,
        stageId: stage.id,
        name: m.name,
        requiredCapabilities: m.requiredCapabilities,
        evidenceRequirements: m.evidenceRequirements,
        status: stage.status === "ACTIVE" ? "AVAILABLE" : "LOCKED",
        priority: m.priority,
        critical: m.critical,
      });
      milestones.push({
        id,
        pathId,
        stageId: stage.id,
        name: m.name,
        requiredCapabilities: m.requiredCapabilities,
        evidenceRequirements: m.evidenceRequirements,
        status: stage.status === "ACTIVE" ? "AVAILABLE" : "LOCKED",
        priority: m.priority,
        critical: m.critical,
        createdAt: new Date().toISOString(),
        verifiedAt: null,
      });
    }
  }

  // 2) Gaps, bottleneck, readiness.
  const { bottleneck, gaps } = identifyBottleneck(requirements, states, allCapabilities);
  const readiness = calculateReadiness(requirements, states);
  const readinessDimensions = calculateReadinessDimensions(requirements, states, milestones, path.targetReadiness);

  // 3) Evaluate milestones in unlocked (ACTIVE or COMPLETE) stages, track regressions for the risk engine.
  const regressed: Array<{ capabilityCode: string; requiredLevel: number; currentLevel: number }> = [];
  const evaluations: Array<{ milestone: PathMilestone; evaluation: MilestoneEvaluation }> = [];
  for (const m of milestones) {
    const stage = stages.find((s) => s.id === m.stageId);
    if (!stage || stage.status === "LOCKED") continue;
    const evaluation = evaluateUnlockedMilestone(m, states);
    evaluations.push({ milestone: m, evaluation });
    if (evaluation.status !== m.status) {
      await repo.updateMilestoneStatus(client, m.id, evaluation.status);
      m.status = evaluation.status;
    } else if (checkForMastery(m, states)) {
      await repo.updateMilestoneStatus(client, m.id, "MASTERED");
      m.status = "MASTERED";
    }
    if (m.status === "VERIFIED" || m.status === "MASTERED") {
      for (const req of m.evidenceRequirements) {
        const state = states.find((s) => s.capabilityCode === req.capabilityCode);
        if (state && req.dimension !== "level" && state[req.dimension] < req.minValue) {
          regressed.push({ capabilityCode: req.capabilityCode, requiredLevel: req.minValue, currentLevel: state[req.dimension] });
        }
      }
    }
  }

  // 4) Stage activation: first stage (by sequence) without all critical milestones VERIFIED/MASTERED is ACTIVE;
  //    everything before it is COMPLETE; everything after stays LOCKED (Section 9).
  const sortedStages = [...stages].sort((a, b) => a.sequence - b.sequence);
  let activeAssigned = false;
  for (const stage of sortedStages) {
    const stageMilestones = milestones.filter((m) => m.stageId === stage.id);
    const criticalDone = stageMilestones.filter((m) => m.critical).every((m) => m.status === "VERIFIED" || m.status === "MASTERED");
    // A stage with no milestones at all (the target has no requirements in
    // its categories) has nothing to gate on and is treated as already
    // complete, rather than becoming a dead-end ACTIVE stage with nothing
    // in it to ever finish.
    const nextStatus = activeAssigned ? "LOCKED" : stageMilestones.length === 0 || criticalDone ? "COMPLETE" : "ACTIVE";
    if (nextStatus === "ACTIVE") activeAssigned = true;
    if (stage.status !== nextStatus) {
      await repo.updateStageStatus(client, stage.id, nextStatus);
      stage.status = nextStatus as PathStage["status"];
      // newly-unlocked stage's milestones move from LOCKED to AVAILABLE
      if (nextStatus === "ACTIVE") {
        for (const m of milestones.filter((mm) => mm.stageId === stage.id && mm.status === "LOCKED")) {
          await repo.updateMilestoneStatus(client, m.id, "AVAILABLE");
          m.status = "AVAILABLE";
        }
      }
    }
  }
  const activeStage = sortedStages.find((s) => s.status === "ACTIVE") ?? sortedStages[sortedStages.length - 1] ?? null;

  // 5) Risks.
  const snapshots = await repo.getSnapshots(client, pathId);
  const recentEvidenceByCapability = new Map<string, Awaited<ReturnType<typeof repo.getRecentEvidence>>>();
  for (const req of requirements) {
    recentEvidenceByCapability.set(req.capabilityCode, await repo.getRecentEvidence(client, path.studentId, req.capabilityCode, 5));
  }
  const rawForecast = await getForecastProjection(snapshots, readiness, path.targetReadiness);
  const projection = formatProjection(rawForecast);

  const riskInput: RiskInput = {
    gaps,
    states,
    snapshots,
    recentEvidenceByCapability,
    deadlineDays: path.deadlineDays,
    readiness,
    targetReadiness: path.targetReadiness,
    projectedWeeksHigh: projection.weeksHigh,
    regressedVerifiedCapabilities: regressed,
  };
  const riskCandidates = detectRisks(riskInput);
  await repo.resolveRisksNotIn(client, pathId, riskCandidates.map((r) => r.type));
  const existingActive = await repo.getActiveRisks(client, pathId);
  for (const candidate of riskCandidates) {
    if (!existingActive.some((r) => r.type === candidate.type)) {
      await repo.insertRisk(client, tenantId, { pathId, ...candidate });
    }
  }

  // 6) Mode.
  const { mode, reason: modeReason } = selectMode(riskCandidates, path.deadlineDays, gaps, readiness, path.targetReadiness);

  // 7) Next best action -- clear stale pending actions, generate the fresh one.
  //    Milestones the student explicitly skipped (Section 34) are excluded so
  //    a skip doesn't just immediately resurface the same suggestion.
  await repo.clearPendingActions(client, pathId);
  const skippedMilestoneIds = await repo.getSkippedMilestoneIds(client, pathId);
  const draft = determineNextBestAction(bottleneck, evaluations, mode, skippedMilestoneIds, gaps, allCapabilities);
  if (draft) {
    await repo.insertAction(client, tenantId, {
      pathId,
      studentId: path.studentId,
      milestoneId: draft.milestoneId,
      type: draft.type,
      capabilityCode: draft.capabilityCode,
      priority: draft.priority,
      reason: draft.reason,
      status: "PENDING",
    });
  }

  // 8) Diff against prior state to build the "why did my path change" explanation (Section 17).
  const previousBottleneck = path.currentBottleneckCode as string | null;
  const newBottleneck = bottleneck?.capabilityCode ?? null;
  const previousMode = path.mode as PathMode;
  let changeExplanation: PathChangeExplanation | null = null;
  if (previousBottleneck !== newBottleneck || previousMode !== mode || reason === "INITIAL_GENERATION") {
    const summary = buildChangeSummary(reason, previousBottleneck, newBottleneck, bottleneck, previousMode, mode, modeReason);
    changeExplanation = { reason, summary, previousBottleneck, newBottleneck, occurredAt: new Date().toISOString() };
    await repo.insertPathEvent(client, tenantId, pathId, "PATH_RECALCULATED", { previousBottleneck, newBottleneck, previousMode, mode }, reason, summary);
  } else {
    await repo.insertPathEvent(client, tenantId, pathId, "PATH_RECALCULATED", { readiness }, reason, null);
  }

  // 9) Persist path + snapshot.
  await repo.updatePathState(client, pathId, {
    mode,
    currentStageId: activeStage?.id ?? null,
    currentBottleneck: newBottleneck,
    readiness,
  });
  await repo.insertSnapshot(client, tenantId, { pathId, stageKey: activeStage?.key ?? "unknown", readiness, bottleneckCapability: newBottleneck });

  return {
    bottleneck,
    readiness,
    mode,
    stages: sortedStages,
    milestones,
    changeExplanation,
  };
}

function buildChangeSummary(
  reason: PathChangeReason,
  prevBottleneck: string | null,
  newBottleneck: string | null,
  bottleneck: Bottleneck | null,
  prevMode: PathMode,
  mode: PathMode,
  modeReason: string
): string {
  const parts: string[] = [];
  if (reason === "INITIAL_GENERATION") {
    parts.push(
      bottleneck
        ? `Your path was generated. Your current limiting factor is ${bottleneck.capabilityName}.`
        : "Your path was generated. There isn't enough evidence yet to identify a specific bottleneck."
    );
  } else if (prevBottleneck !== newBottleneck) {
    if (prevBottleneck && !newBottleneck) {
      parts.push(`Your previous bottleneck no longer has an open, well-evidenced gap.`);
    } else if (!prevBottleneck && newBottleneck) {
      parts.push(`Your path now has enough evidence to identify a bottleneck: ${bottleneck?.capabilityName}.`);
    } else {
      parts.push(`Your bottleneck changed. Your current limiting factor is now ${bottleneck?.capabilityName}.`);
    }
  }
  if (prevMode !== mode) {
    parts.push(`Path mode switched to ${mode.replace("_", " ")}: ${modeReason}`);
  }
  return parts.join(" ");
}
