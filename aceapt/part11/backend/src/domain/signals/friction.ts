import { BehaviorEvent } from '../../types/events';
import { BehaviorSignal } from '../../types/signals';
import { THRESHOLDS } from '../../config/thresholds';
import { withinWindow } from '../time';
import { groupBy, round2 } from '../utils';
import { computeSignalConfidence } from './confidenceScore';
import { makeSignal } from './signalFactory';

/**
 * Question Friction (section 13/14). Two distinct scopes on purpose:
 *
 *  - Per-student: this student struggling with a specific question. Could
 *    be a personal gap - one data point, not evidence about the question.
 *  - Cross-student: many DIFFERENT students struggling with the SAME
 *    question. That shifts the likely explanation from "student friction"
 *    toward "content/product friction" (section 13's own example). This is
 *    computed by detectCrossStudentQuestionFriction() over the full event
 *    store, not a single student's history - see demo/runDemoStory.ts for
 *    it running against real (synthetic) multi-student data.
 */
export function detectQuestionFrictionSignals(events: BehaviorEvent[], studentId: string, now: Date, windowDays: number = THRESHOLDS.windows.MEDIUM_DAYS): BehaviorSignal[] {
  const windowed = withinWindow(events, now, windowDays);
  const byQuestion = groupBy(
    windowed.filter((e) => e.questionId && (e.type === 'QUESTION_STARTED' || e.type === 'QUESTION_ANSWERED' || e.type === 'QUESTION_SKIPPED' || e.type === 'HINT_REQUESTED')),
    (e) => e.questionId as string,
  );

  const signals: BehaviorSignal[] = [];
  for (const [questionId, qEvents] of byQuestion.entries()) {
    const attempts = qEvents.filter((e) => e.type === 'QUESTION_STARTED').length;
    if (attempts < THRESHOLDS.friction.QUESTION_MIN_ATTEMPTS_FOR_SIGNAL) continue;

    const skipped = qEvents.filter((e) => e.type === 'QUESTION_SKIPPED').length;
    const hints = qEvents.filter((e) => e.type === 'HINT_REQUESTED').length;
    const abandonOrSkipRate = attempts > 0 ? skipped / attempts : 0;
    const hintRate = attempts > 0 ? hints / attempts : 0;

    if (abandonOrSkipRate >= THRESHOLDS.friction.QUESTION_ABANDON_OR_SKIP_RATE_FLAG || hintRate >= THRESHOLDS.friction.QUESTION_HINT_RATE_FLAG) {
      signals.push(
        makeSignal({
          studentId,
          signalType: 'QUESTION_FRICTION',
          label: 'STUDENT_LEVEL_FRICTION',
          severity: 'WATCH',
          confidence: computeSignalConfidence({ evidenceCount: attempts, recencyDays: 0, patternConsistency: 0.8 }),
          evidenceCount: attempts,
          observationWindowDays: windowDays,
          supportingMetrics: { questionId, attempts, abandonOrSkipRate: round2(abandonOrSkipRate), hintRate: round2(hintRate) },
          explanation: `This question has shown a high skip or hint-usage rate for this student across ${attempts} attempts. Flagged for review - this alone doesn't identify the cause.`,
          possibleExplanations: ['A specific knowledge gap for this student', 'Question wording or difficulty relative to surrounding material', 'Fatigue at that point in the session'],
        }),
      );
    }
  }
  return signals;
}

/**
 * Cross-student variant: scans ALL students' events for a given question.
 * Distinct students (not just distinct attempts) is the key denominator -
 * one student attempting five times looks nothing like five different
 * students each struggling once, and only the latter supports a
 * content-level conclusion (section 13's core distinction).
 */
export function detectCrossStudentQuestionFriction(allEvents: BehaviorEvent[], questionId: string, now: Date, windowDays: number = THRESHOLDS.windows.LONG_DAYS): BehaviorSignal | null {
  const windowed = withinWindow(allEvents.filter((e) => e.questionId === questionId), now, windowDays);
  const studentsInvolved = new Set(windowed.map((e) => e.studentId));
  if (studentsInvolved.size < THRESHOLDS.friction.CROSS_STUDENT_MIN_STUDENTS_FOR_CONTENT_SIGNAL) return null;

  const attempts = windowed.filter((e) => e.type === 'QUESTION_STARTED').length;
  const skippedOrAbandoned = windowed.filter((e) => e.type === 'QUESTION_SKIPPED').length;
  const rate = attempts > 0 ? skippedOrAbandoned / attempts : 0;
  if (rate < THRESHOLDS.friction.QUESTION_ABANDON_OR_SKIP_RATE_FLAG) return null;

  return makeSignal({
    studentId: '__COHORT__',
    signalType: 'QUESTION_FRICTION',
    label: 'CONTENT_LEVEL_FRICTION',
    severity: 'NOTABLE',
    confidence: computeSignalConfidence({ evidenceCount: studentsInvolved.size, recencyDays: 0, patternConsistency: 0.85 }),
    evidenceCount: studentsInvolved.size,
    observationWindowDays: windowDays,
    supportingMetrics: { questionId, distinctStudents: studentsInvolved.size, attempts, skipRate: round2(rate) },
    explanation: `${studentsInvolved.size} different students showed a high skip rate (${Math.round(rate * 100)}%) on this same question over the last ${windowDays} days. This points toward the question itself (wording, difficulty calibration, or presentation) rather than any individual student's gap.`,
    possibleExplanations: ['Ambiguous or unclear question wording', 'Difficulty miscalibrated relative to its assigned level', 'A rendering or interaction issue specific to this question'],
  });
}
