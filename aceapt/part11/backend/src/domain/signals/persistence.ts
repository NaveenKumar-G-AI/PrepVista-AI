import { BehaviorEvent } from '../../types/events';
import { BehaviorSignal } from '../../types/signals';
import { THRESHOLDS } from '../../config/thresholds';
import { withinWindow } from '../time';
import { round2 } from '../utils';
import { computeSignalConfidence } from './confidenceScore';
import { makeSignal, insufficientEvidenceSignal } from './signalFactory';

/**
 * Persistence Intelligence (section 5): WRONG -> RETRY -> (eventually)
 * CORRECT indicates persistence; WRONG -> EXIT does not. Measured as the
 * share of wrong answers followed by a RETRY_STARTED for the same question
 * within the same session, before that session ends.
 */
export function detectPersistenceSignal(
  events: BehaviorEvent[],
  studentId: string,
  now: Date,
  windowDays: number = THRESHOLDS.windows.MEDIUM_DAYS,
): BehaviorSignal {
  const windowed = withinWindow(events, now, windowDays).sort((a, b) => a.occurredAtUtc.localeCompare(b.occurredAtUtc));
  const wrongAnswers = windowed.filter((e) => e.type === 'QUESTION_ANSWERED' && e.correct === false);

  if (wrongAnswers.length < THRESHOLDS.persistence.MIN_WRONG_ANSWERS_FOR_SIGNAL) {
    return insufficientEvidenceSignal({
      studentId,
      signalType: 'PERSISTENCE_LEVEL',
      observationWindowDays: windowDays,
      explanation: 'Not enough incorrect answers yet to determine a persistence pattern.',
    });
  }

  let retriedAfterWrong = 0;
  for (const wrong of wrongAnswers) {
    const wrongTime = new Date(wrong.occurredAtUtc).getTime();
    const followedByRetry = windowed.some(
      (e) =>
        e.type === 'RETRY_STARTED' &&
        e.sessionId === wrong.sessionId &&
        e.questionId === wrong.questionId &&
        new Date(e.occurredAtUtc).getTime() >= wrongTime,
    );
    if (followedByRetry) retriedAfterWrong += 1;
  }

  const retryRate = retriedAfterWrong / wrongAnswers.length;
  const label =
    retryRate <= THRESHOLDS.persistence.LOW_MAX_RETRY_RATE
      ? 'LOW'
      : retryRate >= THRESHOLDS.persistence.STRONG_MIN_RETRY_RATE
        ? 'STRONG'
        : 'MODERATE';

  const confidence = computeSignalConfidence({ evidenceCount: wrongAnswers.length, recencyDays: 0, patternConsistency: 1 });

  const explanation =
    label === 'STRONG'
      ? `Across ${wrongAnswers.length} incorrect answers in the last ${windowDays} days, you retried ${Math.round(retryRate * 100)}% of them rather than moving on. That's a strong persistence pattern.`
      : label === 'LOW'
        ? `Across ${wrongAnswers.length} incorrect answers in the last ${windowDays} days, you retried ${Math.round(retryRate * 100)}% of them before moving on.`
        : `Across ${wrongAnswers.length} incorrect answers in the last ${windowDays} days, you retried ${Math.round(retryRate * 100)}% of them - a moderate persistence pattern.`;

  return makeSignal({
    studentId,
    signalType: 'PERSISTENCE_LEVEL',
    label,
    severity: label === 'LOW' ? 'WATCH' : 'INFO',
    confidence,
    evidenceCount: wrongAnswers.length,
    observationWindowDays: windowDays,
    supportingMetrics: { wrongAnswers: wrongAnswers.length, retriedAfterWrong, retryRate: round2(retryRate) },
    explanation,
  });
}
