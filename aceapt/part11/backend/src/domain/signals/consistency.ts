import { BehaviorEvent } from '../../types/events';
import { BehaviorSignal } from '../../types/signals';
import { THRESHOLDS } from '../../config/thresholds';
import { activeDateKeys, daysBetweenDateKeys, daysSince, withinWindow } from '../time';
import { mean, stdev, round2 } from '../utils';
import { computeSignalConfidence } from './confidenceScore';
import { makeSignal, insufficientEvidenceSignal } from './signalFactory';

/**
 * Consistency Intelligence (section 1).
 *
 * Deliberately does NOT just sum total study time. It combines:
 *  - coverage: fraction of days in the window that were active at all
 *  - regularity: how evenly spaced the active days were (low variance
 *    between gaps = regular; one huge gap then a cluster = irregular)
 *
 * This is exactly what distinguishes "20 min/day for 7 days" from
 * "140 min once a week" even though their total minutes are equal - see
 * tests/consistency.test.ts for that scenario encoded as an assertion.
 */
export function detectConsistencySignal(
  events: BehaviorEvent[],
  studentId: string,
  now: Date,
  windowDays: number = THRESHOLDS.windows.MEDIUM_DAYS,
): BehaviorSignal {
  const relevant = withinWindow(
    events.filter((e) => e.type === 'SESSION_STARTED' || e.type === 'QUESTION_ANSWERED'),
    now,
    windowDays,
  );
  const activeDays = activeDateKeys(relevant);
  const evidenceCount = activeDays.length;

  if (evidenceCount === 0) {
    return insufficientEvidenceSignal({
      studentId,
      signalType: 'CONSISTENCY_LEVEL',
      observationWindowDays: windowDays,
      explanation: 'Not enough recent activity yet to determine a consistency pattern.',
    });
  }

  const coverageRatio = Math.min(1, evidenceDaysRatio(evidenceCount, windowDays));

  let regularity = 1; // neutral when spacing can't be measured (fewer than 2 active days)
  if (activeDays.length >= 2) {
    const gaps: number[] = [];
    for (let i = 1; i < activeDays.length; i++) gaps.push(daysBetweenDateKeys(activeDays[i - 1], activeDays[i]));
    const avgGap = mean(gaps);
    const gapStdev = stdev(gaps);
    regularity = avgGap === 0 ? 1 : Math.max(0, 1 - gapStdev / avgGap);
  }

  const score = THRESHOLDS.consistency.COVERAGE_WEIGHT * coverageRatio + THRESHOLDS.consistency.REGULARITY_WEIGHT * regularity;
  const label = bucketConsistency(score);

  const mostRecent = relevant[relevant.length - 1];
  const confidence = computeSignalConfidence({
    evidenceCount,
    recencyDays: daysSince(mostRecent.occurredAtUtc, now),
    patternConsistency: activeDays.length >= 2 ? regularity : 0.5,
  });

  const explanation = buildConsistencyExplanation(label, evidenceCount, windowDays, coverageRatio);

  return makeSignal({
    studentId,
    signalType: 'CONSISTENCY_LEVEL',
    label,
    severity: label === 'HIGHLY_IRREGULAR' || label === 'IRREGULAR' ? 'WATCH' : 'INFO',
    confidence,
    evidenceCount,
    observationWindowDays: windowDays,
    supportingMetrics: {
      activeDays: evidenceCount,
      windowDays,
      coverageRatio: round2(coverageRatio),
      regularity: round2(regularity),
      consistencyScore: round2(score),
    },
    explanation,
  });
}

function evidenceDaysRatio(activeDays: number, windowDays: number): number {
  return activeDays / windowDays;
}

function bucketConsistency(score: number): 'HIGHLY_IRREGULAR' | 'IRREGULAR' | 'MODERATE' | 'CONSISTENT' {
  const { HIGHLY_IRREGULAR_MAX, IRREGULAR_MAX, MODERATE_MAX } = THRESHOLDS.consistency.BUCKETS;
  if (score <= HIGHLY_IRREGULAR_MAX) return 'HIGHLY_IRREGULAR';
  if (score <= IRREGULAR_MAX) return 'IRREGULAR';
  if (score <= MODERATE_MAX) return 'MODERATE';
  return 'CONSISTENT';
}

function buildConsistencyExplanation(label: string, activeDays: number, windowDays: number, coverageRatio: number): string {
  const pct = Math.round(coverageRatio * 100);
  switch (label) {
    case 'CONSISTENT':
      return `You were active on ${activeDays} of the last ${windowDays} days (${pct}%), with fairly even spacing between sessions. Your strongest progress tends to happen when preparation stays this regular.`;
    case 'MODERATE':
      return `You were active on ${activeDays} of the last ${windowDays} days (${pct}%). Your preparation has been moderately consistent, with some gaps between sessions.`;
    case 'IRREGULAR':
      return `You were active on ${activeDays} of the last ${windowDays} days (${pct}%). Your preparation has been less consistent recently, with noticeable gaps between sessions.`;
    default:
      return `You were active on ${activeDays} of the last ${windowDays} days (${pct}%). Recent preparation has been highly irregular, with long, uneven gaps between sessions.`;
  }
}

/**
 * Return-to-Learning Intelligence (section 17). Conditional signal: only
 * fires when the student's most recent activity followed a genuine gap.
 * Feature 5 (not this codebase) is responsible for turning this into a
 * welcome-back / recall-check flow - this only emits the observation.
 */
export function detectReturningStudentSignal(events: BehaviorEvent[], studentId: string, now: Date): BehaviorSignal | null {
  const activityEvents = events
    .filter((e) => e.type === 'SESSION_STARTED')
    .sort((a, b) => a.occurredAtUtc.localeCompare(b.occurredAtUtc));
  if (activityEvents.length < 2) return null;

  const last = activityEvents[activityEvents.length - 1];
  const prev = activityEvents[activityEvents.length - 2];
  const gapDays = Math.round((new Date(last.occurredAtUtc).getTime() - new Date(prev.occurredAtUtc).getTime()) / 86_400_000);
  const gapSinceLastSessionDays = daysSince(last.occurredAtUtc, now);

  // Only "returning" if the gap happened recently (i.e. this session really
  // is a comeback relative to now), not an old gap buried in history.
  if (gapDays < THRESHOLDS.returnToLearning.INACTIVITY_GAP_DAYS || gapSinceLastSessionDays > 1) return null;

  return makeSignal({
    studentId,
    signalType: 'RETURNING_STUDENT',
    label: 'RETURNING_AFTER_GAP',
    severity: 'INFO',
    confidence: 1,
    evidenceCount: 1,
    observationWindowDays: gapDays,
    supportingMetrics: { gapDays },
    explanation: `You're back after ${gapDays} days away. Worth a quick recall check before resuming your full plan.`,
  });
}
