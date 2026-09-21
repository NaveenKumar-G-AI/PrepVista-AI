/**
 * NOT part of Feature 11.
 *
 * The brief is explicit (see "IMPORTANT ARCHITECTURAL RULE" and sections
 * 28-32): Feature 11 produces observations and signals; it does not decide
 * the learning plan. That's Feature 7's job, and Feature 7 doesn't exist
 * in this repository.
 *
 * This file is a minimal, clearly-separated stand-in for Feature 7,
 * included only so the prototype can demonstrate the full closed loop
 * end-to-end (section 56). It consumes Feature 11's public
 * BehaviorSignal[] output exactly as a real downstream consumer would -
 * through the same exported types, with no special-cased internals - and
 * produces a plan-change recommendation plus a transparent,
 * evidence-grounded explanation (section 39, "Why did ACEAPT change my
 * plan?"). A real Feature 7 would weigh many more inputs (mastery state,
 * syllabus coverage, exam proximity, etc.); this stub only reacts to
 * Feature 11 signals, on purpose, to keep the demonstration honest about
 * what Feature 11 alone can and cannot justify.
 */
import { BehaviorSignal } from '../types/signals';

export interface PlanChangeRecommendation {
  changed: boolean;
  previousSessionMinutes: number;
  recommendedSessionMinutes?: number;
  reasons: string[];
  triggeredBySignalIds: string[];
}

export function recommendPlanChange(signals: BehaviorSignal[], currentPlannedSessionMinutes: number): PlanChangeRecommendation {
  const realism = signals.find((s) => s.signalType === 'PLAN_REALISM_MISMATCH' && s.status === 'ACTIVE');
  const rhythm = signals.find((s) => s.signalType === 'LEARNING_RHYTHM_PREFERENCE' && s.status === 'ACTIVE');
  const challenge = signals.find((s) => s.signalType === 'CHALLENGE_EXPOSURE' && s.status === 'ACTIVE' && s.label === 'LOW');

  const reasons: string[] = [];
  let recommendedSessionMinutes: number | undefined;

  if (realism) {
    reasons.push(realism.explanation);
    const medianActual = (realism.supportingMetrics as { medianActualMinutes?: number }).medianActualMinutes;
    if (typeof medianActual === 'number') {
      recommendedSessionMinutes = Math.max(10, Math.round(medianActual / 5) * 5);
    }
  }
  if (rhythm) reasons.push(rhythm.explanation);
  if (challenge) reasons.push(challenge.explanation);

  const changed = typeof recommendedSessionMinutes === 'number' && recommendedSessionMinutes !== currentPlannedSessionMinutes;

  return {
    changed,
    previousSessionMinutes: currentPlannedSessionMinutes,
    recommendedSessionMinutes: changed ? recommendedSessionMinutes : undefined,
    reasons,
    triggeredBySignalIds: [realism, rhythm, challenge].filter((s): s is BehaviorSignal => Boolean(s)).map((s) => s.signalId),
  };
}
