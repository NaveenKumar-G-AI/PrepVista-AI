// The Feature 44 orchestrator (Section 72: "Feature 44 owns GOAL,
// TARGET, GAP, PRIORITY, CONSTRAINTS, MILESTONES, GOAL STATE, GOAL
// PROGRESS, GOAL HEALTH"). Every engine call here is deterministic;
// the only AI involvement anywhere in this file is indirectly, via
// AiExtractionService/ExplanationService called from the routes layer,
// never from inside the state-changing logic itself (Section 49).
import type pg from "pg";
import { computeGap } from "../engines/gapEngine.js";
import { computePriority } from "../engines/priorityEngine.js";
import { computeHealth, type HealthSnapshotPoint } from "../engines/healthEngine.js";
import { computeFeasibility } from "../engines/feasibilityEngine.js";
import { computeProgress } from "../engines/progressEngine.js";
import { resolveTarget } from "../engines/targetResolver.js";
import { goalRepository } from "../repositories/goalRepository.js";
import { snapshotRepository } from "../repositories/snapshotRepository.js";
import { historyRepository } from "../repositories/historyRepository.js";
import { milestoneRepository } from "../repositories/milestoneRepository.js";
import { milestoneService } from "./milestoneService.js";
import type { CapabilityDataClient } from "../integrations/capability/CapabilityDataClient.js";
import type { AnalyticsSink } from "../analytics/events.js";
import type {
  AvailableTime,
  CapabilityDimension,
  CapabilitySnapshot,
  DeadlineType,
  Goal,
  GoalType,
  SpeedBand,
} from "../domain/types.js";

export interface CreateGoalRequest {
  goalType: GoalType;
  title?: string;
  description?: string;
  deadlineType: DeadlineType;
  deadlineDays?: number;
  targetDate?: string;
  availableTime: AvailableTime;
  explicitTargetCapability?: Partial<Record<CapabilityDimension, number>>;
  explicitTargetAccuracy?: number;
  explicitTargetSpeedBand?: SpeedBand;
  studentReportedWeakness?: string;
  focusDimension?: CapabilityDimension;
  isPrimary?: boolean;
}

export interface GoalView {
  goal: Goal;
  milestones: Awaited<ReturnType<typeof milestoneRepository.listForGoal>>;
  alreadyAtOrAboveTarget: boolean;
  /** Computed fresh on every read from targetDate - never stored, since
   * it changes daily. The frontend should always display this rather
   * than recomputing its own version from targetDate (see README "Bugs
   * found and fixed" - two independent implementations of the same
   * calendar math drifted by a day depending on time-of-day). */
  daysRemaining: number | null;
}

const DEFAULT_TITLES: Record<GoalType, string> = {
  PLACEMENT_READINESS: "Placement readiness",
  ASSESSMENT_PREPARATION: "Assessment preparation",
  SKILL_IMPROVEMENT: "Skill improvement",
  PERFORMANCE_IMPROVEMENT: "Performance improvement",
  SPEED_IMPROVEMENT: "Speed improvement",
  ACCURACY_IMPROVEMENT: "Accuracy improvement",
  OVERALL_APTITUDE: "Overall aptitude",
  CUSTOM: "My goal",
};

export class GoalService {
  constructor(
    private readonly capabilityClient: CapabilityDataClient,
    private readonly analytics: AnalyticsSink
  ) {}

  async createGoal(client: pg.PoolClient, studentId: string, req: CreateGoalRequest): Promise<GoalView> {
    const current = (await this.capabilityClient.getLatestSnapshot(studentId)) ?? emptySnapshot(studentId);

    const resolved = resolveTarget({
      goalType: req.goalType,
      current,
      explicit: {
        capability: req.explicitTargetCapability,
        accuracy: req.explicitTargetAccuracy,
        speedBand: req.explicitTargetSpeedBand,
      },
      focusDimension: req.focusDimension,
    });

    const targetDate = resolveTargetDate(req.deadlineType, req.deadlineDays, req.targetDate);

    const goal = await goalRepository.create(client, {
      studentId,
      goalType: req.goalType,
      title: req.title?.trim() || DEFAULT_TITLES[req.goalType],
      description: req.description ?? null,
      deadlineType: req.deadlineType,
      targetDate,
      availableTime: req.availableTime ?? {},
      targetCapability: resolved.capability,
      targetAccuracy: resolved.accuracy,
      targetSpeedBand: resolved.speedBand,
      studentReportedWeakness: req.studentReportedWeakness ?? null,
      isPrimary: req.isPrimary ?? true,
      priorityOrder: 1,
      metadata: { explicitlyTargetedDimensions: [...resolved.explicitlyTargetedDimensions] },
    });

    await historyRepository.record(client, goal.id, "CREATED", { goalType: goal.goalType });
    this.analytics.track("goal_created", studentId, { goalId: goal.id, goalType: goal.goalType });

    const computed = await this.recompute(client, goal, current, resolved.explicitlyTargetedDimensions, "CREATED");

    const topPriority = computed.priority.ranked[0];
    const focusForMilestones = topPriority?.target ?? req.focusDimension ?? "quant";
    const baselineScore = scoreForTarget(focusForMilestones, current);
    const targetScore = scoreForTarget(focusForMilestones, {
      studentId,
      assessedAt: new Date().toISOString(),
      scores: resolved.capability,
      accuracy: resolved.accuracy ?? undefined,
      speedBand: resolved.speedBand ?? undefined,
    });
    await milestoneService.generateForGoal(client, goal.id, focusForMilestones, baselineScore, targetScore);

    this.analytics.track("goal_creation_completed", studentId, { goalId: goal.id });

    const finalGoal = await goalRepository.findById(client, goal.id);
    const milestones = await milestoneRepository.listForGoal(client, goal.id);
    return {
      goal: finalGoal!,
      milestones,
      alreadyAtOrAboveTarget: isAlreadyAtOrAboveTarget(computed.gap),
      daysRemaining: computeDaysRemaining(finalGoal!.targetDate),
    };
  }

  async getGoal(client: pg.PoolClient, goalId: string): Promise<GoalView | null> {
    const goal = await goalRepository.findById(client, goalId);
    if (!goal) return null;
    const milestones = await milestoneRepository.listForGoal(client, goalId);
    return {
      goal,
      milestones,
      alreadyAtOrAboveTarget: isAlreadyAtOrAboveTarget(goal.gapSnapshot as any),
      daysRemaining: computeDaysRemaining(goal.targetDate),
    };
  }

  async listGoals(client: pg.PoolClient, statuses?: Goal["status"][]): Promise<Goal[]> {
    return goalRepository.listForStudent(client, statuses);
  }

  /**
   * Recalculates gap/priority/health/feasibility/progress from fresh
   * capability data (Sections 28-29: "the engine must reconsider
   * priorities... do not keep the old recommendation forever").
   */
  async recalculate(client: pg.PoolClient, goalId: string, trigger: "RECALCULATED" | "PERFORMANCE_UPDATE" = "RECALCULATED"): Promise<GoalView> {
    const goal = await goalRepository.findById(client, goalId);
    if (!goal) throw new NotFoundError("goal not found");

    const current = (await this.capabilityClient.getLatestSnapshot(goal.studentId)) ?? emptySnapshot(goal.studentId);
    const storedExplicit = (goal.metadata?.explicitlyTargetedDimensions as CapabilityDimension[] | undefined) ?? [];
    const explicitDims = new Set<CapabilityDimension>(storedExplicit);

    const previousTop = (goal.prioritySnapshot as any[])?.[0]?.target ?? null;
    const computed = await this.recompute(client, goal, current, explicitDims, trigger);
    const newTop = computed.priority.ranked[0]?.target ?? null;

    await milestoneService.evaluate(client, goalId, current, computed.progress.overall);

    await historyRepository.record(client, goalId, "RECALCULATED", { health: computed.health.health });
    if (previousTop && newTop && previousTop !== newTop) {
      await historyRepository.record(client, goalId, "PRIORITY_CHANGED", { from: previousTop, to: newTop });
      this.analytics.track("goal_priority_changed", goal.studentId, { goalId, from: previousTop, to: newTop });
    }
    this.analytics.track("goal_recalculated", goal.studentId, { goalId, trigger });

    const finalGoal = await goalRepository.findById(client, goalId);
    const milestones = await milestoneRepository.listForGoal(client, goalId);
    return {
      goal: finalGoal!,
      milestones,
      alreadyAtOrAboveTarget: isAlreadyAtOrAboveTarget(computed.gap),
      daysRemaining: computeDaysRemaining(finalGoal!.targetDate),
    };
  }

  async pause(client: pg.PoolClient, goalId: string): Promise<Goal> {
    const goal = await goalRepository.findById(client, goalId);
    if (!goal) throw new NotFoundError("goal not found");
    const updated = await goalRepository.updateStatus(client, goalId, "PAUSED", {
      pausedAt: new Date(),
      health: "PAUSED",
      healthReason: "This goal is currently paused.",
    });
    await historyRepository.record(client, goalId, "PAUSED", {});
    this.analytics.track("goal_paused", goal.studentId, { goalId });
    return updated;
  }

  /** Section 32: resuming never blindly restores old priorities - it
   * reassesses current capability first, then recalculates. */
  async resume(client: pg.PoolClient, goalId: string): Promise<GoalView> {
    const goal = await goalRepository.findById(client, goalId);
    if (!goal) throw new NotFoundError("goal not found");
    await goalRepository.updateStatus(client, goalId, "ACTIVE", { resumedAt: new Date() });
    await historyRepository.record(client, goalId, "RESUMED", {});
    this.analytics.track("goal_resumed", goal.studentId, { goalId });
    return this.recalculate(client, goalId, "RECALCULATED");
  }

  /** Section 33: student_marked_complete and system_verified_complete
   * are tracked separately. Status only flips to COMPLETED once the
   * Verification milestone has real evidence behind it. */
  async markStudentComplete(client: pg.PoolClient, goalId: string): Promise<{ goal: Goal; verified: boolean }> {
    const goal = await goalRepository.findById(client, goalId);
    if (!goal) throw new NotFoundError("goal not found");

    await client.query("UPDATE goals SET student_marked_complete = true WHERE id = $1", [goalId]);

    const milestones = await milestoneRepository.listForGoal(client, goalId);
    const verification = milestones.find((m) => m.title === "Verification");
    const verified = verification?.status === "ACHIEVED";

    if (verified) {
      await goalRepository.updateStatus(client, goalId, "COMPLETED", {
        completedAt: new Date(),
        systemVerifiedComplete: true,
        health: "COMPLETED",
        healthReason: "This goal has been completed.",
      });
      await historyRepository.record(client, goalId, "COMPLETED", { studentInitiated: true });
      this.analytics.track("goal_completed", goal.studentId, { goalId });
      return { goal: await goalRepository.findById(client, goalId).then((g) => g!), verified: true };
    }

    const refreshed = await goalRepository.findById(client, goalId);
    return { goal: refreshed!, verified: false };
  }

  private async recompute(
    client: pg.PoolClient,
    goal: Goal,
    current: CapabilitySnapshot,
    explicitlyTargetedDimensions: ReadonlySet<CapabilityDimension>,
    trigger: "CREATED" | "RECALCULATED" | "PERFORMANCE_UPDATE"
  ) {
    const gap = computeGap({
      current,
      targetCapability: goal.targetCapability,
      targetAccuracy: goal.targetAccuracy,
      targetSpeedBand: goal.targetSpeedBand,
    });

    const daysRemaining = computeDaysRemaining(goal.targetDate);
    const priority = computePriority({
      goalType: goal.goalType,
      gap,
      current,
      explicitlyTargetedDimensions,
      targetSpeedBand: goal.targetSpeedBand,
      targetAccuracy: goal.targetAccuracy,
      daysRemaining,
    });

    const priorSnapshots = await snapshotRepository.listForGoal(client, goal.id);
    const healthPoints: HealthSnapshotPoint[] = priorSnapshots.map((s) => ({
      capturedAt: s.capturedAt,
      progress: s.progress,
    }));

    const totalDurationDays = computeTotalDuration(goal.createdAt, goal.targetDate);
    const daysElapsed = Math.max(
      0,
      Math.floor((Date.now() - new Date(goal.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    );

    const baseline = (priorSnapshots[0]?.currentCapability?.scores ?? current.scores) as Partial<
      Record<CapabilityDimension, number>
    >;
    const progress = computeProgress({
      baseline,
      latest: current.scores,
      target: goal.targetCapability,
      weights: Object.fromEntries(priority.ranked.map((r) => [r.target, r.score])) as any,
    });

    healthPoints.push({ capturedAt: new Date().toISOString(), progress: progress.overall });
    const health = computeHealth({
      status: goal.status,
      snapshots: healthPoints,
      daysRemaining,
      totalDurationDays,
      daysElapsedSinceCreation: daysElapsed,
    });

    const hoursPerPointByTarget: Record<string, number | null> = {};
    const gapsByTarget: Record<string, number> = {};
    for (const r of priority.ranked) {
      gapsByTarget[r.target] = gapValueFor(r.target, gap);
      const rate =
        r.target === "speed" || r.target === "accuracy"
          ? undefined
          : current.improvementRatePerHour?.[r.target];
      hoursPerPointByTarget[r.target] = rate ? 1 / rate : null;
    }
    const feasibility = computeFeasibility({
      ranked: priority.ranked,
      gapsByTarget,
      hoursPerPointByTarget,
      availableTime: goal.availableTime,
      daysRemaining,
    });

    const confidence = deriveConfidence(priorSnapshots.length, current);

    await goalRepository.updateComputedState(client, goal.id, {
      currentStateSnapshot: current,
      targetStateSnapshot: { capability: goal.targetCapability, accuracy: goal.targetAccuracy, speedBand: goal.targetSpeedBand },
      gapSnapshot: gap,
      prioritySnapshot: priority.ranked,
      health: health.health,
      healthReason: health.reason,
      feasibility: feasibility.feasibility,
      confidence,
      progress: progress.overall,
    });

    await snapshotRepository.create(client, goal.id, trigger, {
      currentCapability: current,
      targetCapability: goal.targetCapability,
      gap,
      prioritySkills: priority.ranked,
      health: health.health,
      progress: progress.overall,
    });

    return { gap, priority, health, feasibility, progress };
  }
}

export class NotFoundError extends Error {}

function emptySnapshot(studentId: string): CapabilitySnapshot {
  return { studentId, assessedAt: new Date().toISOString(), scores: {} };
}

export function resolveTargetDate(type: DeadlineType, days: number | undefined, exact: string | undefined): string | null {
  if (type === "EXACT_DATE" && exact) return exact;
  if (type === "DAYS_FROM_NOW" && typeof days === "number") {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
  return null; // NONE or UNKNOWN - never invented (Section 47)
}

export function computeDaysRemaining(targetDate: string | null): number | null {
  if (!targetDate) return null;
  const target = new Date(targetDate + "T00:00:00Z");
  const todayMidnightUtc = new Date().toISOString().slice(0, 10) + "T00:00:00Z";
  const ms = target.getTime() - new Date(todayMidnightUtc).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function computeTotalDuration(createdAt: string, targetDate: string | null): number | null {
  if (!targetDate) return null;
  const ms = new Date(targetDate).getTime() - new Date(createdAt).getTime();
  return Math.max(1, Math.round(ms / (1000 * 60 * 60 * 24)));
}

function scoreForTarget(target: CapabilityDimension | "speed" | "accuracy", snapshot: CapabilitySnapshot): number | null {
  if (target === "speed") return null;
  if (target === "accuracy") return snapshot.accuracy ?? null;
  return snapshot.scores[target] ?? null;
}

function gapValueFor(target: CapabilityDimension | "speed" | "accuracy", gap: ReturnType<typeof computeGap>): number {
  if (target === "accuracy") return gap.accuracyGap?.gap ?? 0;
  if (target === "speed") return gap.speedGap?.met === false ? 1 : 0; // band gap, treated as a unit
  return gap.capability.find((c) => c.dimension === target)?.gap ?? 0;
}

function isAlreadyAtOrAboveTarget(gap: ReturnType<typeof computeGap>): boolean {
  const knownGaps = gap.capability.filter((c) => c.gap !== null);
  if (knownGaps.length === 0) return false;
  const allCapabilityMet = knownGaps.every((c) => c.gap === 0);
  const accuracyMet = gap.accuracyGap ? gap.accuracyGap.gap === 0 : true;
  const speedMet = gap.speedGap ? gap.speedGap.met !== false : true;
  return allCapabilityMet && accuracyMet && speedMet;
}

function deriveConfidence(snapshotCount: number, current: CapabilitySnapshot): Goal["confidence"] {
  const hasRateData = Object.keys(current.improvementRatePerHour ?? {}).length > 0;
  if (snapshotCount >= 3 && hasRateData) return "HIGH";
  if (snapshotCount >= 1) return "MODERATE";
  return "LOW";
}
