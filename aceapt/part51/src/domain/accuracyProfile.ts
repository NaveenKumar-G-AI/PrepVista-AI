import type { AccuracyResult, AccuracyScope, AttemptRecord } from "../types/accuracy.js";
import { confidenceForSampleSize, EVIDENCE_THRESHOLDS } from "../types/accuracy.js";

/** §18/§48 — "timed" is derived from pace relative to this student's/skill's expected time, not a separate flag. */
export const PRESSURE_RATIO_THRESHOLD = 0.7;

export function isUnderPressure(a: Pick<AttemptRecord, "responseTimeMs" | "expectedTimeMs">): boolean {
  if (a.responseTimeMs == null || a.expectedTimeMs == null || a.expectedTimeMs <= 0) return false;
  return a.responseTimeMs <= a.expectedTimeMs * PRESSURE_RATIO_THRESHOLD;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** null (not 0%, not a guess) whenever the subgroup itself is too small — §15. */
function gatedPercent(subset: AttemptRecord[]): number | null {
  if (subset.length < EVIDENCE_THRESHOLDS.minSampleForAnyClaim) return null;
  return round1(mean(subset.map((a) => (a.isCorrect ? 1 : 0))) * 100);
}

/**
 * The one function every accuracy number in Feature 51 flows through.
 * `attempts` should already be scoped to whatever `scope`/`scopeId`
 * represents (e.g. one skill) — this function does NOT further filter by
 * scope, only by validity (§129) and by the pressure/novelty/hint axes that
 * layer on top of any scope.
 */
export function computeAccuracyResult(
  attempts: AttemptRecord[],
  scope: AccuracyScope,
  scopeId: string | null
): AccuracyResult {
  const valid = attempts.filter((a) => a.questionValid); // §129 invalid questions never contaminate accuracy
  const sampleSize = valid.length;
  const confidence = confidenceForSampleSize(sampleSize);

  if (confidence === "insufficient") {
    return {
      scope,
      scopeId,
      accuracy: null,
      independentAccuracy: null,
      timedAccuracy: null,
      novelAccuracy: null,
      sampleSize,
      confidence
    };
  }

  const independentSubset = valid.filter((a) => a.hintLevel === "independent");
  const pressureSubset = valid.filter(isUnderPressure);
  const novelSubset = valid.filter((a) => a.isNovel);

  return {
    scope,
    scopeId,
    accuracy: gatedPercent(valid),
    independentAccuracy: gatedPercent(independentSubset),
    timedAccuracy: gatedPercent(pressureSubset),
    novelAccuracy: gatedPercent(novelSubset),
    sampleSize,
    confidence
  };
}

export interface AccuracyProfile {
  overall: AccuracyResult;
  bySkill: AccuracyResult[];
  byDifficulty: AccuracyResult[];
  bySessionPosition: AccuracyResult[]; // scopeId ∈ {"early","mid","late"}
}

function sessionPositionBucket(pct: number): "early" | "mid" | "late" {
  if (pct < 33) return "early";
  if (pct < 67) return "mid";
  return "late";
}

/** §14 — builds the full multi-dimensional profile from one student's attempts. */
export function computeAccuracyProfile(attempts: AttemptRecord[]): AccuracyProfile {
  const overall = computeAccuracyResult(attempts, "overall", null);

  const skillIds = [...new Set(attempts.map((a) => a.skillId))];
  const bySkill = skillIds.map((skillId) =>
    computeAccuracyResult(
      attempts.filter((a) => a.skillId === skillId),
      "skill",
      skillId
    )
  );

  const difficulties: Array<"easy" | "medium" | "hard"> = ["easy", "medium", "hard"];
  const byDifficulty = difficulties
    .map((d) =>
      computeAccuracyResult(
        attempts.filter((a) => a.difficulty === d),
        "difficulty",
        d
      )
    )
    .filter((r) => r.sampleSize > 0);

  const buckets: Array<"early" | "mid" | "late"> = ["early", "mid", "late"];
  const bySessionPosition = buckets
    .map((b) =>
      computeAccuracyResult(
        attempts.filter((a) => a.sessionPositionPct != null && sessionPositionBucket(a.sessionPositionPct) === b),
        "session_position",
        b
      )
    )
    .filter((r) => r.sampleSize > 0);

  return { overall, bySkill, byDifficulty, bySessionPosition };
}
