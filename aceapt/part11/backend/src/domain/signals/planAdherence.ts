import { BehaviorEvent } from '../../types/events';
import { BehaviorSignal } from '../../types/signals';
import { THRESHOLDS } from '../../config/thresholds';
import { withinWindow } from '../time';
import { mean, round2 } from '../utils';
import { computeSignalConfidence } from './confidenceScore';
import { makeSignal, insufficientEvidenceSignal } from './signalFactory';

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Plan Adherence (section 9) + Plan Realism Mismatch (section 9, key
 * capability). Always returns the adherence signal; additionally returns a
 * PLAN_REALISM_MISMATCH signal only when the shortfall is large AND
 * consistent across enough independent days - the brief is explicit that a
 * student repeatedly falling short of an unrealistic target should surface
 * "the plan may not fit," not "the student lacks discipline."
 *
 * Simplification (documented, not hidden): this model tracks one target
 * session length per plan, not a full calendar of scheduled sessions -
 * adherence measures how close actual sessions come to that target, not
 * whether specific scheduled sessions were skipped outright.
 */
export function detectPlanAdherenceSignals(
  events: BehaviorEvent[],
  studentId: string,
  now: Date,
  windowDays: number = THRESHOLDS.windows.MEDIUM_DAYS,
): BehaviorSignal[] {
  // A plan is state, not a windowed behavioral event - it stays "active"
  // until superseded, however long ago it was accepted. Only the SESSIONS
  // being measured against it are limited to the recent window; using the
  // window to also filter which plan is "current" would make an
  // old-but-still-active plan invisible to this detector.
  const allPlanEvents = events
    .filter((e) => (e.type === 'PLAN_ACCEPTED' || e.type === 'PLAN_MODIFIED') && e.plannedSessionMinutes)
    .sort((a, b) => a.occurredAtUtc.localeCompare(b.occurredAtUtc));
  const latestPlan = allPlanEvents[allPlanEvents.length - 1];

  const windowed = withinWindow(events, now, windowDays);
  const sessions = windowed.filter(
    (e) =>
      (e.type === 'SESSION_COMPLETED' || e.type === 'SESSION_ABANDONED') &&
      typeof e.durationSeconds === 'number' &&
      (!latestPlan || e.occurredAtUtc >= latestPlan.occurredAtUtc),
  );

  if (!latestPlan || sessions.length === 0) {
    return [
      insufficientEvidenceSignal({
        studentId,
        signalType: 'PLAN_ADHERENCE',
        observationWindowDays: windowDays,
        explanation: 'No active learning plan with completed sessions yet to measure adherence.',
      }),
    ];
  }

  if (sessions.length < THRESHOLDS.planAdherence.MIN_PLANNED_SESSIONS_FOR_SIGNAL) {
    return [
      insufficientEvidenceSignal({
        studentId,
        signalType: 'PLAN_ADHERENCE',
        observationWindowDays: windowDays,
        explanation: `Only ${sessions.length} session(s) recorded under the current plan so far - not yet enough to determine adherence.`,
      }),
    ];
  }

  const plannedMinutes = latestPlan.plannedSessionMinutes as number;

  const actualMinutesList = sessions.map((s) => (s.durationSeconds as number) / 60);
  const perSessionAdherence = actualMinutesList.map((m) => Math.min(1, m / plannedMinutes));
  const overallAdherence = mean(perSessionAdherence);

  const adherenceLabel =
    overallAdherence >= THRESHOLDS.planAdherence.STRONG_MIN_COMPLETION_RATE
      ? 'STRONG'
      : overallAdherence <= THRESHOLDS.planAdherence.LOW_MAX_COMPLETION_RATE
        ? 'LOW'
        : 'MODERATE';

  const confidence = computeSignalConfidence({ evidenceCount: sessions.length, recencyDays: 0, patternConsistency: 1 });

  const adherenceSignal = makeSignal({
    studentId,
    signalType: 'PLAN_ADHERENCE',
    label: adherenceLabel,
    severity: adherenceLabel === 'LOW' ? 'WATCH' : 'INFO',
    confidence,
    evidenceCount: sessions.length,
    observationWindowDays: windowDays,
    supportingMetrics: {
      plannedSessionMinutes: plannedMinutes,
      sessionsObserved: sessions.length,
      avgActualMinutes: round2(mean(actualMinutesList)),
      overallAdherence: round2(overallAdherence),
    },
    explanation: `You completed an average of ${round2(mean(actualMinutesList))} minutes against a planned ${plannedMinutes} minutes per session (${Math.round(overallAdherence * 100)}%) over the last ${windowDays} days.`,
  });

  // Realism check: was the shortfall large AND consistent, not occasional?
  const shortfallDays = perSessionAdherence.filter((a) => 1 - a >= THRESHOLDS.planAdherence.REALISM_MISMATCH_MIN_GAP_RATIO).length;

  if (shortfallDays < THRESHOLDS.planAdherence.REALISM_MISMATCH_MIN_DAYS) {
    return [adherenceSignal];
  }

  const medianActualMinutes = round2(median(actualMinutesList));
  const realismSignal = makeSignal({
    studentId,
    signalType: 'PLAN_REALISM_MISMATCH',
    label: 'PLAN_MAY_BE_UNREALISTIC',
    severity: 'NOTABLE',
    confidence: computeSignalConfidence({ evidenceCount: shortfallDays, recencyDays: 0, patternConsistency: 1 }),
    evidenceCount: shortfallDays,
    observationWindowDays: windowDays,
    supportingMetrics: { plannedSessionMinutes: plannedMinutes, medianActualMinutes, daysBelowTarget: shortfallDays },
    explanation: `Across the last ${windowDays} days, actual session length consistently landed well below the planned ${plannedMinutes} minutes (median ${medianActualMinutes} min, on ${shortfallDays} separate days). This may mean the plan's target is larger than what currently fits, rather than a lack of effort.`,
  });

  return [adherenceSignal, realismSignal];
}
