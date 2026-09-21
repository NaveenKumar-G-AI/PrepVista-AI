import { BehaviorEvent } from '../../types/events';
import { BehaviorSignal } from '../../types/signals';
import { THRESHOLDS } from '../../config/thresholds';
import { withinWindow } from '../time';
import { round2 } from '../utils';
import { computeSignalConfidence } from './confidenceScore';
import { makeSignal, insufficientEvidenceSignal } from './signalFactory';

/**
 * Challenge Engagement (section 4) / Challenge Avoidance (section 12).
 * These are the same underlying measurement (share of attempts at
 * medium/hard difficulty) at opposite ends of the scale, so one detector
 * covers both. The label is purely descriptive - section 4 is explicit
 * that easy-question selection should never be treated as a fault; it's
 * an input to adaptive progression, not something to shame.
 */
export function detectChallengeExposureSignal(
  events: BehaviorEvent[],
  studentId: string,
  now: Date,
  windowDays: number = THRESHOLDS.windows.MEDIUM_DAYS,
): BehaviorSignal {
  const windowed = withinWindow(events.filter((e) => e.type === 'QUESTION_ANSWERED' && e.difficulty), now, windowDays);

  if (windowed.length < THRESHOLDS.challengeEngagement.MIN_QUESTIONS_FOR_SIGNAL) {
    return insufficientEvidenceSignal({
      studentId,
      signalType: 'CHALLENGE_EXPOSURE',
      observationWindowDays: windowDays,
      explanation: 'Not enough answered questions yet to determine your challenge pattern.',
    });
  }

  const hardMedium = windowed.filter((e) => e.difficulty === 'MEDIUM' || e.difficulty === 'HARD').length;
  const hardMediumShare = hardMedium / windowed.length;

  const hardMediumAttempts = windowed.filter((e) => e.difficulty === 'MEDIUM' || e.difficulty === 'HARD');
  const hardMediumCorrect = hardMediumAttempts.filter((e) => e.correct).length;
  const hardMediumAccuracy = hardMediumAttempts.length > 0 ? hardMediumCorrect / hardMediumAttempts.length : null;

  const label =
    hardMediumShare <= THRESHOLDS.challengeEngagement.LOW_EXPOSURE_MAX_HARD_MEDIUM_SHARE
      ? 'LOW'
      : hardMediumShare >= THRESHOLDS.challengeEngagement.STRONG_ACCEPTANCE_MIN_HARD_MEDIUM_SHARE
        ? 'STRONG_ACCEPTANCE'
        : 'MODERATE';

  const confidence = computeSignalConfidence({ evidenceCount: windowed.length, recencyDays: 0, patternConsistency: 1 });

  const explanation =
    label === 'LOW'
      ? `Over the last ${windowDays} days, ${Math.round(hardMediumShare * 100)}% of your answered questions were medium or hard difficulty. You've had limited exposure to higher-difficulty questions.`
      : label === 'STRONG_ACCEPTANCE'
        ? `Over the last ${windowDays} days, ${Math.round(hardMediumShare * 100)}% of your answered questions were medium or hard difficulty${hardMediumAccuracy !== null ? `, with ${Math.round(hardMediumAccuracy * 100)}% accuracy on those` : ''}. You're engaging well with harder material.`
        : `Over the last ${windowDays} days, ${Math.round(hardMediumShare * 100)}% of your answered questions were medium or hard difficulty - a moderate level of challenge exposure.`;

  return makeSignal({
    studentId,
    signalType: 'CHALLENGE_EXPOSURE',
    label,
    severity: label === 'LOW' ? 'WATCH' : 'INFO',
    confidence,
    evidenceCount: windowed.length,
    observationWindowDays: windowDays,
    supportingMetrics: {
      questionsAnswered: windowed.length,
      hardMediumShare: round2(hardMediumShare),
      hardMediumAccuracy: hardMediumAccuracy !== null ? round2(hardMediumAccuracy) : null,
    },
    explanation,
  });
}
