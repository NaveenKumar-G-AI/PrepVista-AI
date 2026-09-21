// Deterministic goal health (Section 23). Every result carries a reason
// string built only from the numbers below - the explanation service may
// polish the wording, but never invents the verdict (Sections 36, 49).
import type { GoalConfidence, GoalHealth, GoalStatus } from "../domain/types.js";

export interface HealthSnapshotPoint {
  capturedAt: string;
  progress: number;
}

export interface HealthEngineInput {
  status: GoalStatus;
  snapshots: HealthSnapshotPoint[]; // any order; sorted internally
  daysRemaining: number | null;
  totalDurationDays: number | null;
  daysElapsedSinceCreation: number;
}

export interface HealthResult {
  health: GoalHealth;
  reason: string;
  confidence: GoalConfidence;
}

const IMPROVING_THRESHOLD = 3;
const REGRESSION_THRESHOLD = -1;
const LAGGING_THRESHOLD = 20; // points behind the time-proportional expectation

export function computeHealth(input: HealthEngineInput): HealthResult {
  if (input.status === "PAUSED") {
    return { health: "PAUSED", reason: "This goal is currently paused.", confidence: "HIGH" };
  }
  if (input.status === "COMPLETED") {
    return { health: "COMPLETED", reason: "This goal has been completed.", confidence: "HIGH" };
  }

  const sorted = [...input.snapshots].sort(
    (a, b) => new Date(a.capturedAt).getTime() - new Date(b.capturedAt).getTime()
  );

  if (sorted.length < 2) {
    return {
      health: "HEALTHY",
      reason: "This goal was just created - there isn't enough history yet to assess a trend.",
      confidence: "LOW",
    };
  }

  const latest = sorted[sorted.length - 1]!;
  const previous = sorted[sorted.length - 2]!;
  const delta = round2(latest.progress - previous.progress);

  let expectedProgress: number | null = null;
  if (input.totalDurationDays && input.totalDurationDays > 0) {
    expectedProgress = clamp(
      (100 * input.daysElapsedSinceCreation) / input.totalDurationDays,
      0,
      100
    );
  }

  const behindBy = expectedProgress !== null ? round2(expectedProgress - latest.progress) : null;
  const isLagging = behindBy !== null && behindBy > LAGGING_THRESHOLD;
  const deadlineImminent =
    input.daysRemaining !== null &&
    input.totalDurationDays !== null &&
    input.daysRemaining <= Math.max(3, 0.15 * input.totalDurationDays);

  const confidence: GoalConfidence = sorted.length >= 4 ? "HIGH" : sorted.length >= 3 ? "MODERATE" : "LOW";

  if (isLagging && deadlineImminent) {
    return {
      health: "AT_RISK",
      reason: `Progress has slowed while the deadline is approaching: only ${latest.progress}% complete against an expected ${Math.round(
        expectedProgress!
      )}% at this point, with ${input.daysRemaining} day(s) left.`,
      confidence,
    };
  }

  if (isLagging || delta <= REGRESSION_THRESHOLD) {
    const trendNote =
      delta <= REGRESSION_THRESHOLD
        ? `progress moved backward by ${Math.abs(delta)} point(s) since the last check`
        : `progress is ${behindBy}% behind the expected pace for this goal's timeline`;
    return {
      health: "NEEDS_ATTENTION",
      reason: `This goal needs attention because ${trendNote}.`,
      confidence,
    };
  }

  if (delta >= IMPROVING_THRESHOLD) {
    return {
      health: "IMPROVING",
      reason: `Progress increased by ${delta} point(s) since the last check-in.`,
      confidence,
    };
  }

  return {
    health: "HEALTHY",
    reason: "This goal is progressing in line with expectations.",
    confidence,
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
