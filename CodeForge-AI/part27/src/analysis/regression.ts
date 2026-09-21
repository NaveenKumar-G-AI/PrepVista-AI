import type { SkillEvidence } from '../types/evidence.js';
import type { RegressionSeverity } from '../types/skill-state.js';
import { growthRules } from '../config/growth-rules.js';
import { aggregateEvidence } from '../skill-state/aggregate.js';

/**
 * Regression Detection (section 22-23). Two independent signals both have
 * to clear a bar before anything is flagged as regressing — a consecutive-
 * failure streak, or a real drop from the student's last stable score.
 * Either alone can be noise (one bad day; one lucky miss); together they
 * are what the spec calls "sufficient evidence" (section 22).
 */

export interface RegressionResult {
  isRegressing: boolean;
  severity: RegressionSeverity | null;
  consecutiveNegative: number;
  scoreDrop: number | null;
}

export function detectRegression(evidence: SkillEvidence[], nowIso: string, priorStableScore: number | null): RegressionResult {
  const { minConsecutiveNegative, windowDays, severityBands } = growthRules.regression;

  const sortedDesc = [...evidence].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  let consecutiveNegative = 0;
  for (const e of sortedDesc) {
    if (e.outcome === 'negative') consecutiveNegative += 1;
    else break;
  }

  const windowCutoff = new Date(nowIso).getTime() - windowDays * 86_400_000;
  const windowEvidence = evidence.filter((e) => new Date(e.timestamp).getTime() >= windowCutoff);
  const windowAgg = aggregateEvidence(windowEvidence, nowIso);

  const scoreDrop = priorStableScore !== null && windowAgg.score !== null ? priorStableScore - windowAgg.score : null;

  const meetsConsecutiveThreshold = consecutiveNegative >= minConsecutiveNegative;
  const meetsDropThreshold = scoreDrop !== null && scoreDrop >= severityBands.MINOR;

  if (!meetsConsecutiveThreshold && !meetsDropThreshold) {
    return { isRegressing: false, severity: null, consecutiveNegative, scoreDrop };
  }

  let severity: RegressionSeverity = 'MINOR';
  const magnitude = scoreDrop ?? severityBands.MINOR; // consecutive-only trigger still gets a severity floor
  if (magnitude >= severityBands.CRITICAL) severity = 'CRITICAL';
  else if (magnitude >= severityBands.SIGNIFICANT) severity = 'SIGNIFICANT';
  else if (magnitude >= severityBands.MODERATE) severity = 'MODERATE';

  return { isRegressing: true, severity, consecutiveNegative, scoreDrop };
}
