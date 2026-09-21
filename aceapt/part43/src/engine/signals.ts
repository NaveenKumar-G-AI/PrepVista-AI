import { DiagnosticConfig } from '../domain/types';
import { AdaptiveDiagnosticState, CoverageState, FatigueState } from '../domain/state';
import { ENGINE_CONSTANTS as C } from './constants';

// ---------------------------------------------------------------------------
// Coverage guardrails (spec section 22)
// ---------------------------------------------------------------------------

export function initializeCoverage(config: Pick<DiagnosticConfig, 'requiredDomains' | 'minQuestionsPerDomain'>) {
  const coverage: Record<string, CoverageState> = {};
  for (const domain of config.requiredDomains) {
    coverage[domain] = {
      domain,
      questionsAsked: 0,
      minimumRequired: config.minQuestionsPerDomain,
      satisfied: config.minQuestionsPerDomain === 0,
    };
  }
  return coverage;
}

export function recordCoverage(coverage: Record<string, CoverageState>, domain: string): Record<string, CoverageState> {
  const existing = coverage[domain];
  if (!existing) return coverage;
  const questionsAsked = existing.questionsAsked + 1;
  return {
    ...coverage,
    [domain]: { ...existing, questionsAsked, satisfied: questionsAsked >= existing.minimumRequired },
  };
}

// ---------------------------------------------------------------------------
// Exposure / anti-memorization tracking (spec sections 30-31, 92)
// ---------------------------------------------------------------------------

export function recordExposure(exposure: Record<string, number>, questionId: string): Record<string, number> {
  return { ...exposure, [questionId]: (exposure[questionId] ?? 0) + 1 };
}

export function recordPatternExposure(patternExposure: Record<string, number>, tags: string[]): Record<string, number> {
  if (tags.length === 0) return patternExposure;
  const next = { ...patternExposure };
  for (const tag of tags) next[tag] = (next[tag] ?? 0) + 1;
  return next;
}

// ---------------------------------------------------------------------------
// Fatigue detection (spec section 40, 81)
// ---------------------------------------------------------------------------

export function detectFatigue(state: Pick<AdaptiveDiagnosticState, 'recentResponses'>): FatigueState {
  const recent = state.recentResponses.slice(-C.FATIGUE_WINDOW);
  const consecutiveFastGuesses = countConsecutiveFastGuesses(state);

  if (recent.length < C.FATIGUE_WINDOW) {
    return {
      responseTimeTrend: 'stable',
      accuracyTrend: 'stable',
      consecutiveFastGuesses,
      severity: consecutiveFastGuesses >= 2 ? 'mild' : 'none',
      recommendPause: false,
    };
  }

  const mid = Math.floor(recent.length / 2);
  const firstHalf = recent.slice(0, mid);
  const secondHalf = recent.slice(mid);

  const avgTime = (arr: typeof recent) => arr.reduce((a, r) => a + r.responseTimeMs, 0) / arr.length;
  const accuracy = (arr: typeof recent) => arr.filter((r) => r.isCorrect).length / arr.length;

  const timeRatio = avgTime(secondHalf) / Math.max(1, avgTime(firstHalf));
  const accuracyDrop = accuracy(firstHalf) - accuracy(secondHalf);

  const responseTimeTrend: FatigueState['responseTimeTrend'] =
    timeRatio > C.FATIGUE_RESPONSE_TIME_INCREASE_RATIO ? 'increasing' : timeRatio < 0.8 ? 'decreasing' : 'stable';
  const accuracyTrend: FatigueState['accuracyTrend'] =
    accuracyDrop > C.FATIGUE_ACCURACY_DROP ? 'declining' : accuracyDrop < -C.FATIGUE_ACCURACY_DROP ? 'improving' : 'stable';

  let severity: FatigueState['severity'] = 'none';
  if (responseTimeTrend === 'increasing' && accuracyTrend === 'declining') severity = 'high';
  else if (responseTimeTrend === 'increasing' || accuracyTrend === 'declining' || consecutiveFastGuesses >= 3) {
    severity = 'moderate';
  } else if (consecutiveFastGuesses >= 2) severity = 'mild';

  return { responseTimeTrend, accuracyTrend, consecutiveFastGuesses, severity, recommendPause: severity === 'high' };
}

function countConsecutiveFastGuesses(state: Pick<AdaptiveDiagnosticState, 'recentResponses'>): number {
  let count = 0;
  for (let i = state.recentResponses.length - 1; i >= 0; i--) {
    const r = state.recentResponses[i];
    if (!r.isCorrect && r.responseTimeMs < 5000) count++;
    else break;
  }
  return count;
}
