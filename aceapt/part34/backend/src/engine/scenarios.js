import { computeCapabilityGaps } from './recommend.js';
import { getTarget } from '../data/careerTargets.js';

/*
 * ---------------------------------------------------------------------------
 * SCENARIO ENGINE (deterministic - no I/O, no AI)
 * ---------------------------------------------------------------------------
 * Produces PLANNING scenarios, not predictions. Every number here is a
 * transparent projection of already-observed data (linear extrapolation, or
 * a named "what if this capability's rate of improvement changed" modeling
 * assumption) - never a probability of a real-world outcome like being
 * selected or hired. See brief sections 14/15: no guarantees, no fabricated
 * percentages, and the language used ("potential", "planning scenario",
 * "based on current evidence") is deliberate.
 * ---------------------------------------------------------------------------
 */

const PROJECTION_DAYS = 30;

function projectLevel(currentLevel, weeklySlope, days) {
  if (weeklySlope == null) return currentLevel;
  return Math.max(0, Math.min(100, Math.round(currentLevel + (weeklySlope / 7) * days)));
}

function describeGapOutcome(projected, targetLevel) {
  const gap = targetLevel - projected;
  if (gap <= 0) return 'would likely be at or above the level this target typically requires';
  if (gap <= 8) return 'would likely be close to the level this target typically requires';
  if (gap <= 20) return 'would likely still have a moderate gap to the level this target typically requires';
  return 'would likely still have a significant gap to the level this target typically requires';
}

export function computeScenarioA_ContinuePath(limitingFactor, limitingTrendInfo) {
  if (!limitingFactor) {
    return {
      id: 'continue_current_path',
      title: 'Continue current approach',
      summary: 'No single capability is currently limiting this target - continuing the current pattern is a reasonable planning baseline.',
      basis: 'Evidence-based projection.',
    };
  }
  const projected = projectLevel(limitingFactor.currentLevel, limitingTrendInfo?.weeklySlope, PROJECTION_DAYS);
  return {
    id: 'continue_current_path',
    title: 'Continue current approach',
    summary: `If the current pattern for ${limitingFactor.label} continues for about ${PROJECTION_DAYS} days, it ${describeGapOutcome(
      projected,
      limitingFactor.targetLevel
    )}. This is a planning estimate based on the recent trend, not a guarantee.`,
    projectedLevel: projected,
    basis: `Extrapolates the observed ${limitingTrendInfo?.weeklySlope ?? 0} pt/week trend for ${limitingFactor.label}.`,
  };
}

export function computeScenarioB_FocusBottleneck(limitingFactor, limitingTrendInfo) {
  if (!limitingFactor) {
    return {
      id: 'focus_bottleneck',
      title: 'Focus on current bottleneck',
      summary: 'There is currently no single limiting capability to focus on.',
      basis: 'Evidence-based projection.',
    };
  }
  // Named modeling assumption: focused practice roughly doubles the recent
  // weekly rate of change, capped to a believable range. This is disclosed
  // as an assumption, not presented as a measured fact.
  const baselineSlope = Math.max(limitingTrendInfo?.weeklySlope ?? 0, 0.5);
  const modeledSlope = Math.min(baselineSlope * 2, 9);
  const projected = projectLevel(limitingFactor.currentLevel, modeledSlope, PROJECTION_DAYS);

  return {
    id: 'focus_bottleneck',
    title: `Focus on ${limitingFactor.label}`,
    summary: `If focused practice on ${limitingFactor.label} roughly doubles its recent rate of improvement, it ${describeGapOutcome(
      projected,
      limitingFactor.targetLevel
    )} within about ${PROJECTION_DAYS} days. This assumes the modeled improvement rate actually happens - it's a planning scenario, not a commitment.`,
    projectedLevel: projected,
    basis: `Models ${modeledSlope.toFixed(1)} pt/week for ${limitingFactor.label} (roughly double the recent ${baselineSlope.toFixed(
      1
    )} pt/week), applied for ${PROJECTION_DAYS} days.`,
  };
}

export function computeScenarioC_ChangeTarget(currentTargetId, altTargetId, signalsByCapability) {
  const altTarget = getTarget(altTargetId);
  if (!altTarget) return null;
  const gaps = computeCapabilityGaps(altTarget, signalsByCapability);

  const reused = gaps.filter((g) => g.hasEvidence);
  const netNew = gaps.filter((g) => !g.hasEvidence);
  const reuseRatio = gaps.length ? reused.length / gaps.length : 0;
  const alignment = reuseRatio >= 0.6 ? 'Strong' : reuseRatio >= 0.3 ? 'Moderate' : 'Limited';

  const currentTarget = getTarget(currentTargetId);

  return {
    id: 'change_target',
    title: `Compare with ${altTarget.title}`,
    summary: `Based on existing evidence, alignment with ${altTarget.title} is currently ${alignment.toLowerCase()}: ${reused.length} of ${
      gaps.length
    } required capabilities already have some evidence, and ${netNew.length} would need to be built from the start. This is a comparison to support your own decision, not a recommendation to switch from ${
      currentTarget?.title ?? 'your current target'
    }.`,
    alignment,
    reusedCapabilities: reused.map((g) => g.label),
    newCapabilities: netNew.map((g) => g.label),
    basis: `Compares your current evidence against ${altTarget.title}'s required capabilities.`,
  };
}

export function generatePlan(target, gaps, limitingFactor) {
  const sortedGaps = [...gaps].filter((g) => g.gap > 0).sort((a, b) => b.gap * b.weight - a.gap * a.weight);
  const top = limitingFactor ? limitingFactor.label : sortedGaps[0]?.label;
  const second = sortedGaps.find((g) => g.label !== top)?.label;

  return {
    day30: [
      top ? `Address the current top limiting factor: ${top}.` : 'Maintain current preparation pattern.',
      'Complete one opportunity-aligned simulation to generate fresh evidence.',
      'Log outcomes so the trajectory reflects real, current evidence.',
    ],
    day60: [
      second
        ? `Begin building ${second} alongside continued focus on ${top ?? 'your current priority'}.`
        : 'Deepen evidence in your strongest capabilities with a small project.',
      'Build one additional piece of portfolio evidence (project or applied exercise).',
      'Re-check trajectory to confirm the chosen intervention is actually moving the number, not just activity.',
    ],
    day90: [
      'Consolidate capabilities that are now close to target level.',
      'Increase opportunity engagement using capabilities with the strongest current evidence.',
      'Revisit whether the current target still has the best alignment, using the scenario comparison.',
    ],
  };
}
