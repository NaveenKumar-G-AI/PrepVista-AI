import type { Confidence, SkillObservation } from "./types.js";

/** Below this, we don't even attempt a confidence grade — there just isn't enough to grade. */
const HARD_FLOOR_EVIDENCE = 2;

const HIGH_THRESHOLD = 11;
const MODERATE_THRESHOLD = 6;

/**
 * Turns evidence volume, diversity, and recency into a confidence grade.
 * This exists so that "Algorithms +18 (1 submission)" and
 * "Algorithms +18 (20 submissions across 8 problem families)" never look
 * the same to a student or an institution.
 */
export function calculateConfidence(observation: SkillObservation): Confidence {
  const evidenceCount = observation.evidence.length;
  if (evidenceCount < HARD_FLOOR_EVIDENCE) return "INSUFFICIENT";

  const distinctTypes = new Set(observation.evidence.map((e) => e.type)).size;
  const distinctFamilies = new Set(
    observation.evidence.map((e) => e.problemFamily).filter((f): f is string => Boolean(f))
  ).size;

  const mostRecentMs = Math.max(
    ...observation.evidence.map((e) => new Date(e.observedAt).getTime())
  );
  const daysSinceMostRecent = (Date.now() - mostRecentMs) / (1000 * 60 * 60 * 24);

  let score = 0;
  score += Math.min(Math.log2(evidenceCount + 1) * 2, 6); // volume, diminishing returns
  score += Math.min(distinctTypes, 3); // evidence-type diversity
  score += Math.min(distinctFamilies, 3); // problem-family diversity (anti-gaming)
  if (daysSinceMostRecent <= 14) score += 3;
  else if (daysSinceMostRecent <= 45) score += 1.5;

  if (score >= HIGH_THRESHOLD) return "HIGH";
  if (score >= MODERATE_THRESHOLD) return "MODERATE";
  return "LOW";
}
