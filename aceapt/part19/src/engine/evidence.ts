// ============================================================================
// Evidence engine.
//
// Turns a raw history of RetrievalAttempts into a RetentionEvidence view.
// This is where "10 similar questions ≠ mastery" gets enforced: context
// diversity is measured explicitly, not assumed from a correct-count.
// ============================================================================

import { RetrievalAttempt, RetentionEvidence, ContextExposure } from '../domain/types';

const RECENT_WINDOW = 5;

function successRate(attempts: RetrievalAttempt[]): number | null {
  if (attempts.length === 0) return null;
  return attempts.filter(a => a.correct).length / attempts.length;
}

function contextKey(c: ContextExposure): string {
  return `${c.templateId}|${c.difficultyBand}|${c.method}|${c.topicWrapper}`;
}

/**
 * Shannon-entropy-based diversity score over the contexts a concept has
 * been exercised in, normalized to 0–1. Ten near-identical questions
 * collapse to a low score even if every one was answered correctly.
 */
export function computeContextDiversityScore(attempts: RetrievalAttempt[]): number {
  if (attempts.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const a of attempts) {
    const k = contextKey(a.context);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const n = attempts.length;
  const entropy = [...counts.values()].reduce((sum, c) => {
    const p = c / n;
    return sum - p * Math.log2(p);
  }, 0);
  const maxEntropy = Math.log2(counts.size || 1);
  return maxEntropy === 0 ? 0 : Number((entropy / maxEntropy).toFixed(3));
}

/**
 * How much this evidence base can be trusted, 0–1. Gates whether a numeric
 * strength score is shown at all (engine/retentionStrength.ts) — the point
 * being: never manufacture 87.43% out of two data points.
 */
export function computeEvidenceSufficiency(attempts: RetrievalAttempt[]): number {
  if (attempts.length === 0) return 0;
  const volumeFactor = Math.min(1, attempts.length / 6); // saturates around 6 attempts
  const diversityFactor = computeContextDiversityScore(attempts);
  const distinctDays = new Set(attempts.map(a => a.createdAt.slice(0, 10))).size;
  const spreadFactor = Math.min(1, distinctDays / 3); // spread over time, not one sitting
  return Number((0.5 * volumeFactor + 0.3 * spreadFactor + 0.2 * diversityFactor).toFixed(3));
}

function daysBetween(fromIso: string, toIso: string): number {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return Math.max(0, ms / (1000 * 60 * 60 * 24));
}

export function buildRetentionEvidence(
  studentId: string,
  conceptId: string,
  attempts: RetrievalAttempt[],
  baselineSuccessRate: number | null,
  now: string
): RetentionEvidence {
  const sorted = [...attempts].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const recent = sorted.slice(-RECENT_WINDOW);
  const lastSuccess = [...sorted].reverse().find(a => a.correct);
  const transferAttempts = sorted.filter(a => a.mode === 'transfer');
  const timedAttempts = sorted.filter(a => a.context.timed);
  const untimedAttempts = sorted.filter(a => !a.context.timed);
  // Reactivation "repair" attempts run as mode 'micro'; standard/mixed attempts outside
  // a reactivation flow are excluded so this rate reflects repair-specific success.
  const reactivationAttempts = sorted.filter(a => a.mode === 'micro');

  return {
    studentId,
    conceptId,
    attemptCount: sorted.length,
    distinctContexts: new Set(sorted.map(a => contextKey(a.context))).size,
    contextDiversityScore: computeContextDiversityScore(sorted),
    delayDaysSinceLastSuccess: lastSuccess ? Number(daysBetween(lastSuccess.createdAt, now).toFixed(2)) : null,
    recentSuccessRate: successRate(recent),
    baselineSuccessRate,
    transferSuccessRate: successRate(transferAttempts),
    timedSuccessRate: successRate(timedAttempts),
    untimedSuccessRate: successRate(untimedAttempts),
    timedAttemptCount: timedAttempts.length,
    untimedAttemptCount: untimedAttempts.length,
    timedVsUntimedGap:
      successRate(untimedAttempts) !== null && successRate(timedAttempts) !== null
        ? Number((successRate(untimedAttempts)! - successRate(timedAttempts)!).toFixed(3))
        : null,
    hintDependencyRate: sorted.length ? sorted.filter(a => a.hintsUsed > 0).length / sorted.length : 0,
    explanationDependencyRate: sorted.length ? sorted.filter(a => a.explanationRequested).length / sorted.length : 0,
    reactivationSuccessRate: successRate(reactivationAttempts),
  };
}
