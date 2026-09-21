import { THRESHOLDS } from '../config/thresholds';
import { FalseMasterySignal } from '../types';

/**
 * SS13 False Mastery Detection.
 * A student can look strong in familiar practice while performing far
 * worse on novel/transfer problems or in realistic simulation. This
 * compares practice performance against the *weakest* of the two
 * stronger evidence sources (transfer, simulation) rather than an
 * average, since either one alone is enough to flag the gap.
 */
export function detectFalseMastery(
  skill: string,
  practiceScore: number | null,
  transferScore: number | null,
  simulationScore: number | null
): FalseMasterySignal | null {
  if (practiceScore === null) return null;
  const comparisons = [transferScore, simulationScore].filter((v): v is number => v !== null);
  if (comparisons.length === 0) return null;

  const weakest = Math.min(...comparisons);
  const gap = practiceScore - weakest;
  const detected = gap >= THRESHOLDS.falseMastery.minGapPoints;

  return {
    skill,
    practiceScore,
    transferScore,
    simulationScore,
    gap: Number(gap.toFixed(1)),
    detected,
    message: detected
      ? `Observed practice performance in ${skill} is substantially stronger than demonstrated transferable performance.`
      : `Practice and transfer/simulation performance in ${skill} are reasonably aligned.`,
  };
}
