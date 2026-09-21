import { EffectivenessResult } from '../types/domain';

const IMPROVEMENT_THRESHOLD = 0.15; // minimum accuracy delta to call it "improved"

/**
 * Compares before/after accuracy for one intervention cycle. This function
 * NEVER declares mastery (Section 20) — "improved" only means the evidence
 * got better, not that the skill is mastered. Mastery verification is owned
 * by Feature 14; this result is the evidence Feature 16 sends it.
 */
export function evaluateEffectiveness(beforeAccuracy: number, afterAccuracy: number, transferAccuracy?: number): EffectivenessResult {
  const delta = afterAccuracy - beforeAccuracy;
  const improved = delta >= IMPROVEMENT_THRESHOLD;

  const independenceTrend: EffectivenessResult['independenceTrend'] = improved
    ? 'improved'
    : delta <= -IMPROVEMENT_THRESHOLD
    ? 'declined'
    : 'unchanged';

  let transferStatus: EffectivenessResult['transferStatus'] = 'not_assessed';
  if (typeof transferAccuracy === 'number') {
    transferStatus = transferAccuracy >= 0.75 ? 'strong' : transferAccuracy >= 0.5 ? 'developing' : 'weak';
  }

  const note = improved
    ? `Accuracy moved from ${Math.round(beforeAccuracy * 100)}% to ${Math.round(afterAccuracy * 100)}% after the intervention. This is new evidence for Feature 14, not a mastery declaration on its own.`
    : `Accuracy did not move meaningfully (${Math.round(beforeAccuracy * 100)}% -> ${Math.round(afterAccuracy * 100)}%). The selector should try a different intervention type rather than repeating this one.`;

  return { improved, beforeAccuracy, afterAccuracy, delta, independenceTrend, transferStatus, note };
}
