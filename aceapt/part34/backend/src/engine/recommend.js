import { TREND } from './trend.js';
import { INTERVENTION_CATALOG } from '../data/careerTargets.js';

/*
 * ---------------------------------------------------------------------------
 * RECOMMENDATION ENGINE (deterministic - no I/O, no AI)
 * ---------------------------------------------------------------------------
 * Turns per-capability state (current level, gap to target, trend) into:
 *   - capability gaps, distinguishing measured weakness from unmeasured gaps
 *   - the single top limiting factor (brief sections 20/36)
 *   - an activity-vs-progress mismatch flag (section 7)
 *   - one recommended next intervention (section 24 - "smallest useful")
 *   - a readiness-distance bucket (section 18)
 *   - a momentum read (section 19)
 * ---------------------------------------------------------------------------
 */

export function computeCapabilityGaps(target, signalsByCapability) {
  return target.capabilities.map((req) => {
    const signals = signalsByCapability[req.capability] || [];
    const hasEvidence = signals.length > 0;
    const recentWindow = signals.slice(-3);
    const currentLevel = hasEvidence
      ? Math.round(recentWindow.reduce((a, s) => a + s.score, 0) / recentWindow.length)
      : 0;
    const gap = Math.max(0, req.targetLevel - currentLevel);
    return {
      capability: req.capability,
      label: req.label,
      weight: req.weight,
      targetLevel: req.targetLevel,
      currentLevel,
      gap,
      hasEvidence,
      isEvidenceGap: !hasEvidence,
      n: signals.length,
    };
  });
}

/**
 * Picks the single top limiting factor. A demonstrated, measured weakness is
 * always preferred over an unmeasured capability - "we've seen you struggle
 * here" is a stronger, more actionable signal than "we simply haven't
 * measured this yet" (brief section 36: an evidence gap needs a different,
 * lighter intervention - go build evidence - not an alarm). Evidence gaps
 * only become the top limiting factor when there is no measured weakness at
 * all.
 */
export function findLimitingFactor(gaps, trendsByCapability) {
  if (gaps.length === 0) return null;

  const scored = gaps.map((g) => {
    const trendInfo = trendsByCapability[g.capability];
    const trendPenalty = {
      [TREND.DECLINING]: 1.5,
      [TREND.STALLED]: 1.2,
      [TREND.SLOWING]: 0.9,
      [TREND.STABLE]: 0.5,
      [TREND.IMPROVING]: 0.2,
      [TREND.ACCELERATING]: 0,
      [TREND.INSUFFICIENT_DATA]: 0.6,
    }[trendInfo?.trend ?? TREND.INSUFFICIENT_DATA];
    const priority = g.gap * g.weight * (1 + trendPenalty);
    return { ...g, trend: trendInfo?.trend ?? TREND.INSUFFICIENT_DATA, priority };
  });

  const measuredCandidates = scored.filter((g) => !g.isEvidenceGap && g.gap > 2);
  const pool = measuredCandidates.length > 0 ? measuredCandidates : scored.filter((g) => g.isEvidenceGap);
  if (pool.length === 0) return null;

  pool.sort((a, b) => b.priority - a.priority);
  const top = pool[0];

  return {
    capability: top.capability,
    label: top.label,
    type: top.isEvidenceGap ? 'evidence_gap' : 'capability_gap',
    gap: top.gap,
    currentLevel: top.currentLevel,
    targetLevel: top.targetLevel,
    trend: top.trend,
    reason: top.isEvidenceGap
      ? `No evidence has been recorded yet for ${top.label}, so readiness for it can't be confirmed.`
      : `${top.label} is ${top.gap} points below the level this target typically requires, and recent evidence shows a ${top.trend
          .toLowerCase()
          .replaceAll('_', ' ')} trend.`,
  };
}

const ACTIVITY_TYPES = new Set(['practice', 'simulation']);

/**
 * Detects "high activity, limited measurable progress" (brief section 7):
 * recent attempt volume is up for a capability while its score trend is
 * flat or worse. Language here is deliberately non-shaming per the brief.
 */
export function detectActivityProgressMismatch(signalsByCapability, trendsByCapability, now = new Date()) {
  const findings = [];
  const cutRecent = new Date(now);
  cutRecent.setDate(cutRecent.getDate() - 14);
  const cutPrior = new Date(now);
  cutPrior.setDate(cutPrior.getDate() - 28);

  for (const [capability, signals] of Object.entries(signalsByCapability)) {
    const recentActivity = signals.filter((s) => ACTIVITY_TYPES.has(s.type) && new Date(s.occurredAt) >= cutRecent).length;
    const priorActivity = signals.filter(
      (s) => ACTIVITY_TYPES.has(s.type) && new Date(s.occurredAt) >= cutPrior && new Date(s.occurredAt) < cutRecent
    ).length;
    const trendInfo = trendsByCapability[capability];
    const worseningPattern = trendInfo && [TREND.STALLED, TREND.SLOWING, TREND.DECLINING].includes(trendInfo.trend);

    if (recentActivity >= 2 && recentActivity > priorActivity && worseningPattern) {
      findings.push({
        capability,
        recentActivity,
        priorActivity,
        trend: trendInfo.trend,
        message: `Your ${capability.replaceAll(
          '_',
          ' '
        )} practice activity has increased recently, but measurable improvement has been limited. A different practice approach may be more useful than more of the same kind of practice.`,
      });
    }
  }
  return findings;
}

/**
 * Picks the smallest useful intervention for the limiting factor, avoiding
 * whatever modality was already tried most recently without moving the
 * score (brief sections 20/25).
 */
export function recommendIntervention(limitingFactor, recentDecisions) {
  if (!limitingFactor) return null;
  const options = INTERVENTION_CATALOG[limitingFactor.capability] || ['Targeted practice session'];

  const recentTitlesForCapability = recentDecisions
    .filter((d) => d.type === 'intervention_started' && d.payload?.capability === limitingFactor.capability)
    .slice(-2)
    .map((d) => d.payload?.title);

  const nextOption = options.find((o) => !recentTitlesForCapability.includes(o)) || options[0];

  return {
    capability: limitingFactor.capability,
    title: nextOption,
    reason:
      limitingFactor.type === 'evidence_gap'
        ? `Starting here builds the first evidence for ${limitingFactor.label}, which is currently unmeasured.`
        : `This directly targets ${limitingFactor.label}, the capability currently furthest from what this target typically requires.`,
  };
}

export function computeReadinessDistance(gaps) {
  const measured = gaps.filter((g) => g.hasEvidence);
  if (measured.length < Math.ceil(gaps.length / 2)) return 'INSUFFICIENT_EVIDENCE';

  const significant = gaps.filter((g) => g.isEvidenceGap || g.gap >= 20).length;
  const moderate = gaps.filter((g) => !g.isEvidenceGap && g.gap >= 8 && g.gap < 20).length;

  if (significant >= 1) return 'SIGNIFICANT_DISTANCE';
  if (moderate >= 2) return 'MODERATE_DISTANCE';
  return 'SHORT_DISTANCE';
}

export function computeMomentum({ recentSignalCount, capabilityTrends, recentCompletions }) {
  if (capabilityTrends.every((c) => c.trend.trend === TREND.INSUFFICIENT_DATA)) return 'INSUFFICIENT_DATA';

  const positiveCount = capabilityTrends.filter((c) => [TREND.IMPROVING, TREND.ACCELERATING].includes(c.trend.trend)).length;
  const negativeCount = capabilityTrends.filter((c) => [TREND.STALLED, TREND.DECLINING].includes(c.trend.trend)).length;

  if (recentSignalCount === 0) return 'STALLED';
  if (positiveCount >= 1 && positiveCount >= negativeCount && recentCompletions >= 1) return 'HIGH_MOMENTUM';
  if (recentSignalCount >= 2 && positiveCount >= negativeCount) return 'STEADY';
  if (negativeCount > positiveCount) return 'SLOWING';
  return 'STEADY';
}
