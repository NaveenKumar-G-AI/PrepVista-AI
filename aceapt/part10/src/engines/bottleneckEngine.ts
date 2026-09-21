import { THRESHOLDS } from '../config/thresholds';
import { BottleneckCandidate, BottleneckResult, BottleneckChainStep } from '../types';

export interface BottleneckInput {
  skill: string;
  weaknessSeverity: number; // 0-100, higher = weaker
  simulationTimeCostRatio: number; // observed/allocated time, 1.0 = on budget
  downstreamAccuracyEffect: number; // 0-1 proxy for effect on later accuracy
}

/**
 * SS18 Bottleneck Engine, SS19 Bottleneck Chain.
 * Does not just list every weakness - ranks them by *impact* (a
 * weighted blend of raw weakness, time cost in realistic simulation,
 * and downstream accuracy effect) so the single most consequential
 * skill surfaces as PRIMARY, not just the lowest raw score.
 */
export function detectBottlenecks(inputs: BottleneckInput[]): BottleneckResult {
  if (inputs.length === 0) {
    return { primary: null, secondary: null, ranked: [], chain: [] };
  }

  const w = THRESHOLDS.bottleneck.impactWeights;
  const ranked: BottleneckCandidate[] = inputs
    .map((i) => {
      const timeCostNorm = Math.min(1, Math.max(0, (i.simulationTimeCostRatio - 1) / 0.6));
      const impactScore =
        (i.weaknessSeverity / 100) * w.weaknessSeverity +
        timeCostNorm * w.simulationTimeCost +
        i.downstreamAccuracyEffect * w.downstreamAccuracyEffect;
      return { ...i, impactScore: Number(impactScore.toFixed(3)) };
    })
    .sort((a, b) => b.impactScore - a.impactScore);

  const primary = ranked[0] ?? null;
  const secondary = ranked[1] ?? null;

  const chain: BottleneckChainStep[] = [];
  const cfg = THRESHOLDS.bottleneck;
  if (primary && primary.simulationTimeCostRatio > cfg.chainTimeCostRatioThreshold) {
    chain.push({
      description: `${primary.skill} weakness is associated with above-budget solving time in simulation.`,
      strength: 'SUPPORTED_PATTERN',
    });
    chain.push({
      description: 'Extra time spent here reduces time remaining for later questions.',
      strength: 'SUPPORTED_PATTERN',
    });
    if (primary.downstreamAccuracyEffect > cfg.chainAccuracyEffectThreshold) {
      chain.push({
        description: 'Rushed later questions are associated with reduced accuracy in the same simulation.',
        strength: 'SUPPORTED_PATTERN',
      });
    } else {
      chain.push({
        description: 'A downstream accuracy effect is possible but not yet strongly evidenced.',
        strength: 'POSSIBLE_CONTRIBUTOR',
      });
    }
  }

  return { primary, secondary, ranked, chain };
}
