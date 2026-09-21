import type { ComparabilityResult, SkillObservation } from "./types.js";

/**
 * Below this many evidence items backing the CURRENT observation, we refuse
 * to call a comparison meaningful — a single lucky (or unlucky) submission
 * must not read as "growth".
 */
export const MIN_EVIDENCE_FOR_COMPARISON = 3;

/**
 * Two observations less than this far apart don't represent a meaningful
 * time separation — comparing "this morning" to "this afternoon" is not a
 * growth signal, it's noise.
 */
export const MIN_TIME_SEPARATION_MS = 1000 * 60 * 60 * 24 * 3; // 3 days

/**
 * Calculation versions that are known to be safe to compare directly
 * because the underlying scoring scale did not change in a way that
 * breaks comparability. A version not listed in any group is only
 * comparable to itself.
 */
const COMPATIBLE_VERSION_GROUPS: string[][] = [["v1"]];

function versionsCompatible(a: string, b: string): boolean {
  if (a === b) return true;
  return COMPATIBLE_VERSION_GROUPS.some((group) => group.includes(a) && group.includes(b));
}

export interface ComparabilityOptions {
  requireSameAssessmentType?: boolean;
  minEvidence?: number;
  minTimeSeparationMs?: number;
}

/**
 * Determines whether `current` can be validly compared against `baseline`
 * to produce a growth number. This is the gate that keeps the system from
 * manufacturing a value when the underlying states are not comparable.
 */
export function checkComparability(
  baseline: SkillObservation,
  current: SkillObservation,
  opts: ComparabilityOptions = {}
): ComparabilityResult {
  const reasons: string[] = [];
  const minEvidence = opts.minEvidence ?? MIN_EVIDENCE_FOR_COMPARISON;
  const minTimeSeparationMs = opts.minTimeSeparationMs ?? MIN_TIME_SEPARATION_MS;

  if (baseline.skillId !== current.skillId) {
    reasons.push("DIFFERENT_SKILL_DEFINITION");
  }

  if (!versionsCompatible(baseline.calculationVersion, current.calculationVersion)) {
    reasons.push("INCOMPATIBLE_CALCULATION_VERSION");
  }

  if (opts.requireSameAssessmentType && baseline.assessmentType !== current.assessmentType) {
    reasons.push("INCOMPATIBLE_ASSESSMENT_TYPE");
  }

  if (current.evidence.length < minEvidence) {
    reasons.push("INSUFFICIENT_EVIDENCE");
  }

  const baselineTime = new Date(baseline.observedAt).getTime();
  const currentTime = new Date(current.observedAt).getTime();
  const timeSeparation = currentTime - baselineTime;

  if (timeSeparation <= 0) {
    reasons.push("NON_CHRONOLOGICAL_OBSERVATIONS");
  } else if (timeSeparation < minTimeSeparationMs) {
    reasons.push("INSUFFICIENT_TIME_SEPARATION");
  }

  return { comparable: reasons.length === 0, reasons };
}
