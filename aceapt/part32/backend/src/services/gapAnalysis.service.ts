import type { AssessmentAttempt, CapabilityGap, Confidence, RoleRubric, Trend } from "../types/domain.js";
import { getCapability } from "../config/rubrics.js";

/**
 * All numeric reasoning in this file is deterministic, ordinary code —
 * intentionally. Per the product spec (section 19), scores, gaps, trend
 * detection and confidence are calculations, not judgment calls, so an
 * LLM has no business making them. AI is reserved for turning this
 * already-computed, evidence-backed structure into natural language
 * (see explanation.service.ts).
 */

// Named thresholds — not magic numbers scattered through the logic below.
const TREND_LOOKBACK_ATTEMPTS = 3;
const TREND_DELTA_THRESHOLD = 5; // points, avg score change to call it a trend
const HIGH_CONFIDENCE_MIN_ATTEMPTS = 3;
const HIGH_CONFIDENCE_MAX_AGE_DAYS = 60;
const MEDIUM_CONFIDENCE_MAX_AGE_DAYS = 120;
const UNASSESSED_URGENCY_SCALE = 60; // how urgent "no data yet" is, scaled by weight

export function computeTrend(attemptsAsc: AssessmentAttempt[]): Trend {
  if (attemptsAsc.length < 2) return "INSUFFICIENT_DATA";
  const recent = attemptsAsc.slice(-TREND_LOOKBACK_ATTEMPTS);
  const deltas: number[] = [];
  for (let i = 1; i < recent.length; i++) {
    deltas.push(recent[i]!.score - recent[i - 1]!.score);
  }
  const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  if (avgDelta >= TREND_DELTA_THRESHOLD) return "IMPROVING";
  if (avgDelta <= -TREND_DELTA_THRESHOLD) return "DECLINING";
  return "STABLE";
}

export function computeConfidence(evidenceCount: number, lastAssessedAt: string | null): Confidence {
  if (evidenceCount === 0 || !lastAssessedAt) return "INSUFFICIENT_DATA";
  const daysSince = (Date.now() - new Date(lastAssessedAt).getTime()) / 86_400_000;
  if (evidenceCount >= HIGH_CONFIDENCE_MIN_ATTEMPTS && daysSince <= HIGH_CONFIDENCE_MAX_AGE_DAYS) return "HIGH";
  if (daysSince <= MEDIUM_CONFIDENCE_MAX_AGE_DAYS) return "MEDIUM";
  return "LOW"; // evidence exists but is stale
}

const CONFIDENCE_MULTIPLIER: Record<Confidence, number> = {
  HIGH: 1,
  MEDIUM: 0.8,
  LOW: 0.5,
  INSUFFICIENT_DATA: 0,
};

/**
 * Computes one CapabilityGap per rubric entry. Capabilities with zero
 * evidence still get a priority score (scaled by how much the role
 * weighs them) so an unassessed, high-weight capability can still
 * surface as "go find out where you stand on this first" — it just
 * gets a different action type than a measured gap (see
 * recommendation.service.ts).
 */
export function computeCapabilityGaps(
  rubric: RoleRubric,
  attempts: AssessmentAttempt[],
): (CapabilityGap & { priorityScore: number })[] {
  return rubric.entries.map((entry) => {
    const capability = getCapability(entry.capabilityId);
    const capAttemptsAsc = attempts
      .filter((a) => a.capabilityId === entry.capabilityId)
      .sort((a, b) => a.takenAt.localeCompare(b.takenAt));

    const evidenceCount = capAttemptsAsc.length;
    const latest = capAttemptsAsc.at(-1) ?? null;
    const currentScore = latest ? latest.score : null;
    const lastAssessedAt = latest ? latest.takenAt : null;
    const confidence = computeConfidence(evidenceCount, lastAssessedAt);
    const trend = computeTrend(capAttemptsAsc);
    const gap = currentScore === null ? null : Math.max(0, entry.targetBar - currentScore);
    const onTrack = currentScore !== null && currentScore >= entry.targetBar;

    const priorityScore =
      evidenceCount === 0
        ? entry.weight * UNASSESSED_URGENCY_SCALE
        : (gap ?? 0) * entry.weight * CONFIDENCE_MULTIPLIER[confidence];

    return {
      capabilityId: entry.capabilityId,
      capabilityName: capability?.name ?? entry.capabilityId,
      category: capability?.category ?? "technical",
      weight: entry.weight,
      targetBar: entry.targetBar,
      currentScore,
      gap,
      trend,
      confidence,
      evidenceCount,
      lastAssessedAt,
      onTrack,
      priorityScore,
      evidence: capAttemptsAsc.slice(-5).map((a) => ({
        attemptId: a.id,
        score: a.score,
        takenAt: a.takenAt,
        source: a.source,
      })),
    };
  });
}
