import { ConfidenceLevel } from "../domain/enums.js";

/**
 * Deterministic confidence model shared by requirement-coverage and
 * regression analysis. Confidence is a function of evidence *quantity* and
 * *consistency* — never of how eloquent an AI explanation sounds.
 */
export function confidenceFromEvidenceCount(supportingCount: number, contradictingCount: number): ConfidenceLevel {
  if (contradictingCount > 0) return ConfidenceLevel.LOW; // conflicting evidence is never HIGH confidence
  if (supportingCount >= 3) return ConfidenceLevel.HIGH;
  if (supportingCount >= 1) return ConfidenceLevel.MEDIUM;
  return ConfidenceLevel.LOW;
}

/** Combine several confidence levels conservatively (weakest link wins). */
export function combineConfidence(levels: ConfidenceLevel[]): ConfidenceLevel {
  if (levels.length === 0) return ConfidenceLevel.LOW;
  if (levels.includes(ConfidenceLevel.LOW)) return ConfidenceLevel.LOW;
  if (levels.includes(ConfidenceLevel.MEDIUM)) return ConfidenceLevel.MEDIUM;
  return ConfidenceLevel.HIGH;
}
