import { BehaviorEvent } from '../../types/events';
import { BehaviorSignal } from '../../types/signals';
import { THRESHOLDS } from '../../config/thresholds';
import { withinWindow } from '../time';
import { round2 } from '../utils';
import { computeSignalConfidence } from './confidenceScore';
import { makeSignal, insufficientEvidenceSignal } from './signalFactory';

/**
 * Help/Assistance Dependency (section 7). Measures the share of answered
 * questions preceded by a hint or a viewed solution in the same attempt.
 * Per section 7, HIGH_ASSISTANCE_DEPENDENCY is explicitly never framed as
 * "the student is weak" - the explanation text always uses the brief's own
 * reframing: independent performance should be verified.
 */
export function detectAssistanceDependencySignal(
  events: BehaviorEvent[],
  studentId: string,
  now: Date,
  windowDays: number = THRESHOLDS.windows.MEDIUM_DAYS,
): BehaviorSignal {
  const windowed = withinWindow(events, now, windowDays).sort((a, b) => a.occurredAtUtc.localeCompare(b.occurredAtUtc));
  const answered = windowed.filter((e) => e.type === 'QUESTION_ANSWERED');

  if (answered.length < THRESHOLDS.assistanceDependency.MIN_ANSWERED_FOR_SIGNAL) {
    return insufficientEvidenceSignal({
      studentId,
      signalType: 'ASSISTANCE_DEPENDENCY',
      observationWindowDays: windowDays,
      explanation: 'Not enough answered questions yet to determine an assistance pattern.',
    });
  }

  let assistedCount = 0;
  for (const ans of answered) {
    const answerTime = new Date(ans.occurredAtUtc).getTime();
    const usedHelp = windowed.some(
      (e) =>
        (e.type === 'HINT_REQUESTED' || e.type === 'SOLUTION_VIEWED') &&
        e.sessionId === ans.sessionId &&
        e.questionId === ans.questionId &&
        new Date(e.occurredAtUtc).getTime() <= answerTime,
    );
    if (usedHelp) assistedCount += 1;
  }

  const assistanceRate = assistedCount / answered.length;
  const label =
    assistanceRate >= THRESHOLDS.assistanceDependency.HIGH_MIN_RATE
      ? 'HIGH'
      : assistanceRate <= THRESHOLDS.assistanceDependency.LOW_MAX_RATE
        ? 'LOW'
        : 'MODERATE';

  const confidence = computeSignalConfidence({ evidenceCount: answered.length, recencyDays: 0, patternConsistency: 1 });

  const explanation =
    label === 'HIGH'
      ? `${Math.round(assistanceRate * 100)}% of your answered questions in the last ${windowDays} days involved a hint or viewed solution first. This doesn't mean you're weak in the material - it means independent performance on similar questions is worth verifying next.`
      : label === 'LOW'
        ? `Only ${Math.round(assistanceRate * 100)}% of your answered questions in the last ${windowDays} days involved a hint or viewed solution first - mostly independent attempts.`
        : `${Math.round(assistanceRate * 100)}% of your answered questions in the last ${windowDays} days involved a hint or viewed solution first - a moderate reliance on assistance.`;

  return makeSignal({
    studentId,
    signalType: 'ASSISTANCE_DEPENDENCY',
    label,
    severity: label === 'HIGH' ? 'WATCH' : 'INFO',
    confidence,
    evidenceCount: answered.length,
    observationWindowDays: windowDays,
    supportingMetrics: { questionsAnswered: answered.length, assistedCount, assistanceRate: round2(assistanceRate) },
    explanation,
  });
}
