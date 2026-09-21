import { BehaviorEvent } from '../../types/events';
import { BehaviorSignal } from '../../types/signals';
import { detectConsistencySignal, detectReturningStudentSignal } from './consistency';
import { detectSessionBehaviorSignal } from './sessionBehavior';
import { detectAbandonmentSignal } from './abandonment';
import { detectChallengeExposureSignal } from './challengeEngagement';
import { detectPersistenceSignal } from './persistence';
import { detectRecoverySignal } from './recovery';
import { detectAssistanceDependencySignal } from './assistanceDependency';
import { detectConfidenceCalibrationSignal } from './confidenceCalibration';
import { detectPlanAdherenceSignals } from './planAdherence';
import { detectLearningRhythmSignal, detectCrammingSignal } from './temporalPatterns';
import { detectQuestionFrictionSignals } from './friction';
import { detectWorkloadSignals } from './workload';

export {
  detectConsistencySignal,
  detectReturningStudentSignal,
  detectSessionBehaviorSignal,
  detectAbandonmentSignal,
  detectChallengeExposureSignal,
  detectPersistenceSignal,
  detectRecoverySignal,
  detectAssistanceDependencySignal,
  detectConfidenceCalibrationSignal,
  detectPlanAdherenceSignals,
  detectLearningRhythmSignal,
  detectCrammingSignal,
  detectQuestionFrictionSignals,
  detectWorkloadSignals,
};
export { detectCrossStudentQuestionFriction } from './friction';

/**
 * Pipeline stage (section 22): Behavior Signals.
 * Runs every detector for one student's event history and returns the
 * combined, flat signal list - the 8 "always-on" dimension detectors plus
 * whichever conditional pattern detectors actually found something. This
 * is the single function the API layer and the demo script call; it is
 * the only place that needs to change if a new detector is added.
 *
 * Enforces one invariant up front, for every detector at once: nothing
 * after `now` is visible. This matters whenever a profile is computed "as
 * of" a past cutoff (a historical snapshot, or the demo script's
 * before/after comparison) - without it, a detector reading full history
 * for state that "persists until changed" (e.g. which plan is currently
 * active) could pick up a change that, relative to that cutoff, hadn't
 * happened yet.
 */
export function runAllSignalDetectors(events: BehaviorEvent[], studentId: string, now: Date = new Date()): BehaviorSignal[] {
  const nowMs = now.getTime();
  const visibleEvents = events.filter((e) => new Date(e.occurredAtUtc).getTime() <= nowMs);
  const signals: BehaviorSignal[] = [];

  // Always-on: these back the 8 headline profile dimensions (section 18).
  signals.push(detectConsistencySignal(visibleEvents, studentId, now));
  signals.push(detectLearningRhythmSignal(visibleEvents, studentId, now));
  signals.push(detectChallengeExposureSignal(visibleEvents, studentId, now));
  signals.push(detectPersistenceSignal(visibleEvents, studentId, now));
  signals.push(detectRecoverySignal(visibleEvents, studentId, now));
  signals.push(detectAssistanceDependencySignal(visibleEvents, studentId, now));
  signals.push(detectConfidenceCalibrationSignal(visibleEvents, studentId, now));
  signals.push(...detectPlanAdherenceSignals(visibleEvents, studentId, now));

  // Conditional / notable-pattern signals: internal + adaptive-layer facing,
  // only appear when actually detected (section 40: internal dashboard).
  signals.push(detectSessionBehaviorSignal(visibleEvents, studentId, now));
  signals.push(detectAbandonmentSignal(visibleEvents, studentId, now));
  const returning = detectReturningStudentSignal(visibleEvents, studentId, now);
  if (returning) signals.push(returning);
  const cramming = detectCrammingSignal(visibleEvents, studentId, now);
  if (cramming) signals.push(cramming);
  signals.push(...detectQuestionFrictionSignals(visibleEvents, studentId, now));
  signals.push(...detectWorkloadSignals(visibleEvents, studentId, now));

  return signals;
}
