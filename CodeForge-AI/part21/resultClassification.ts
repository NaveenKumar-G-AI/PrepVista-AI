/**
 * Result Classification.
 *
 * Never binary. Six outcomes, each reachable only through a documented,
 * deterministic threshold check — see tests/engines.test.ts for one worked
 * example per branch, including the explicit "excellent explanation, weak
 * everything else" memorization-resistant pattern from the spec.
 */
import type { ResultClassification, UnderstandingProfile } from "@/types/index.js";

type ProfileForClassification = Omit<UnderstandingProfile, "classification">;

const MIN_PROBES_FOR_A_VERDICT = 2;
const MIN_ASSESSED_DIMENSIONS_FOR_A_VERDICT = 3;
const MIN_CONFIDENCE_FOR_A_VERDICT = 30;

const STRONG_CONCEPTUAL_THRESHOLD = 75;
const STRONG_CONFIDENCE_THRESHOLD = 55;

const DEMONSTRATED_CONCEPTUAL_THRESHOLD = 55;
const DEMONSTRATED_CONFIDENCE_THRESHOLD = 45;

/** How large a procedural-vs-conceptual gap must be before it signals the
 *  "sounds good, doesn't hold up under probing" memorization-resistant pattern. */
const MEMORIZATION_PATTERN_GAP_THRESHOLD = 20;

const GAP_CONCEPTUAL_THRESHOLD = 40;
const GAP_MIN_CONFIDENCE = 45;

export function classifyUnderstanding(profile: ProfileForClassification): ResultClassification {
  const assessedDims = Object.values(profile.dimensions).filter((d) => d.status !== "not_assessed");

  // 1. Not enough has happened yet to say anything meaningful — report that
  //    honestly rather than guessing.
  if (
    profile.probes_asked < MIN_PROBES_FOR_A_VERDICT ||
    assessedDims.length < MIN_ASSESSED_DIMENSIONS_FOR_A_VERDICT ||
    profile.overall_confidence < MIN_CONFIDENCE_FOR_A_VERDICT
  ) {
    return "INSUFFICIENT_EVIDENCE";
  }

  // 2. Contradictory evidence: a real mix of "strong" and "gap_identified"
  //    dimensions with confidence too low to resolve which picture is right.
  const gapShare = assessedDims.filter((d) => d.status === "gap_identified").length / assessedDims.length;
  const strongShare = assessedDims.filter((d) => d.status === "strong").length / assessedDims.length;
  const isContradictory = gapShare > 0.25 && strongShare > 0.25;
  if (isContradictory && profile.overall_confidence < STRONG_CONFIDENCE_THRESHOLD) {
    return "UNCERTAIN";
  }

  const proceduralConceptualGap = profile.procedural_score - profile.conceptual_score;

  // 3. Clearly strong across the board.
  if (
    profile.conceptual_score >= STRONG_CONCEPTUAL_THRESHOLD &&
    profile.overall_confidence >= STRONG_CONFIDENCE_THRESHOLD &&
    profile.overall_evidence_strength !== "weak"
  ) {
    return "STRONG_UNDERSTANDING";
  }

  // 4. The memorization-resistant pattern: looks good procedurally / in the
  //    initial explanation, but deeper probing didn't hold up. This check is
  //    intentionally placed BEFORE the generic "demonstrated" check so a
  //    good explanation can never mask a real gap underneath it.
  if (proceduralConceptualGap >= MEMORIZATION_PATTERN_GAP_THRESHOLD && profile.overall_confidence >= GAP_MIN_CONFIDENCE) {
    return "PARTIAL_UNDERSTANDING";
  }

  // 5. Solid, consistent evidence of real understanding, short of "strong".
  if (profile.conceptual_score >= DEMONSTRATED_CONCEPTUAL_THRESHOLD && profile.overall_confidence >= DEMONSTRATED_CONFIDENCE_THRESHOLD) {
    return "UNDERSTANDING_DEMONSTRATED";
  }

  // 6. Confidently low: this is a real gap, not just missing evidence.
  if (profile.conceptual_score < GAP_CONCEPTUAL_THRESHOLD && profile.overall_confidence >= GAP_MIN_CONFIDENCE) {
    return "UNDERSTANDING_GAP";
  }

  // 7. Everything else — evidence exists but doesn't cleanly resolve.
  return "UNCERTAIN";
}
