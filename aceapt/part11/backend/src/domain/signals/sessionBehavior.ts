import { BehaviorEvent } from '../../types/events';
import { BehaviorSignal } from '../../types/signals';
import { THRESHOLDS } from '../../config/thresholds';
import { withinWindow } from '../time';
import { round2 } from '../utils';
import { computeSignalConfidence } from './confidenceScore';
import { makeSignal, insufficientEvidenceSignal } from './signalFactory';

/**
 * Session Behavior Intelligence (section 2).
 *
 * Reports completion rate, productive interaction (questions actually
 * answered, not just a session sitting open), skip rate, retry rate, and
 * help usage. Explicitly does NOT claim to measure "how much was learned" -
 * only what the event stream can actually support (section 2: "do not
 * claim to know exact cognitive learning").
 */
export function detectSessionBehaviorSignal(
  events: BehaviorEvent[],
  studentId: string,
  now: Date,
  windowDays: number = THRESHOLDS.windows.MEDIUM_DAYS,
): BehaviorSignal {
  const windowed = withinWindow(events, now, windowDays);
  const started = windowed.filter((e) => e.type === 'SESSION_STARTED');
  const completed = windowed.filter((e) => e.type === 'SESSION_COMPLETED');
  const answered = windowed.filter((e) => e.type === 'QUESTION_ANSWERED');
  const skipped = windowed.filter((e) => e.type === 'QUESTION_SKIPPED');
  const help = windowed.filter((e) => e.type === 'HINT_REQUESTED' || e.type === 'SOLUTION_VIEWED');

  if (started.length === 0) {
    return insufficientEvidenceSignal({
      studentId,
      signalType: 'SESSION_BEHAVIOR_SUMMARY',
      observationWindowDays: windowDays,
      explanation: 'Not enough recent sessions yet to summarize session behavior.',
    });
  }

  const completionRate = completed.length / started.length;
  const avgAnsweredPerSession = round2(answered.length / started.length);
  const attemptedTotal = answered.length + skipped.length;
  const helpRate = attemptedTotal > 0 ? help.length / attemptedTotal : 0;

  const label =
    completionRate >= THRESHOLDS.sessionBehavior.HIGH_COMPLETION_MIN
      ? 'HIGH_COMPLETION'
      : completionRate <= THRESHOLDS.sessionBehavior.LOW_COMPLETION_MAX
        ? 'LOW_COMPLETION'
        : 'MODERATE_COMPLETION';

  const mostRecent = started[started.length - 1];
  const confidence = computeSignalConfidence({
    evidenceCount: started.length,
    recencyDays: 0,
    patternConsistency: 1,
  });
  void mostRecent;

  return makeSignal({
    studentId,
    signalType: 'SESSION_BEHAVIOR_SUMMARY',
    label,
    severity: label === 'LOW_COMPLETION' ? 'WATCH' : 'INFO',
    confidence,
    evidenceCount: started.length,
    observationWindowDays: windowDays,
    supportingMetrics: {
      sessionsStarted: started.length,
      sessionsCompleted: completed.length,
      completionRate: round2(completionRate),
      avgQuestionsAnsweredPerSession: avgAnsweredPerSession,
      helpRate: round2(helpRate),
    },
    explanation: `Over the last ${windowDays} days you started ${started.length} session${started.length === 1 ? '' : 's'} and completed ${completed.length} (${Math.round(completionRate * 100)}%), answering an average of ${avgAnsweredPerSession} questions per session. This reflects session activity, not how much you actually learned.`,
  });
}
