import { BehaviorEvent } from '../../types/events';
import { BehaviorSignal } from '../../types/signals';
import { THRESHOLDS } from '../../config/thresholds';
import { withinWindow } from '../time';
import { mean, stdev, round2 } from '../utils';
import { computeSignalConfidence } from './confidenceScore';
import { makeSignal, insufficientEvidenceSignal } from './signalFactory';

/**
 * Session/Assessment Abandonment Intelligence (section 3).
 *
 * Flags REPEATED_SESSION_ABANDONMENT only when abandonment points cluster
 * (similar progress fraction each time) AND happen often enough to be a
 * pattern rather than one-off scatter. Per section 3, this NEVER concludes
 * a single cause ("student is lazy") - possibleExplanations always lists
 * multiple plausible, non-diagnostic causes, and the label itself is
 * purely descriptive.
 */
export function detectAbandonmentSignal(
  events: BehaviorEvent[],
  studentId: string,
  now: Date,
  windowDays: number = THRESHOLDS.windows.MEDIUM_DAYS,
): BehaviorSignal {
  const windowed = withinWindow(events, now, windowDays);
  const abandoned = windowed.filter(
    (e) => (e.type === 'SESSION_ABANDONED' || e.type === 'ASSESSMENT_ABANDONED') && typeof e.progressFraction === 'number',
  );

  if (abandoned.length < THRESHOLDS.abandonment.MIN_ABANDONED_FOR_SIGNAL) {
    return insufficientEvidenceSignal({
      studentId,
      signalType: 'REPEATED_SESSION_ABANDONMENT',
      observationWindowDays: windowDays,
      explanation:
        abandoned.length === 0
          ? 'No abandoned sessions recorded in this window.'
          : 'A small number of sessions were left unfinished, not yet enough to call it a pattern.',
    });
  }

  const points = abandoned.map((e) => e.progressFraction as number);
  const spread = stdev(points);
  const avgPoint = mean(points);
  const isRepeatedPattern = spread <= THRESHOLDS.abandonment.MAX_SPREAD_FOR_REPEATED_PATTERN;

  const confidence = computeSignalConfidence({
    evidenceCount: abandoned.length,
    recencyDays: 0,
    patternConsistency: isRepeatedPattern ? 1 - spread : 0.4,
  });

  const label = isRepeatedPattern ? 'REPEATED_SESSION_ABANDONMENT' : 'SCATTERED_ABANDONMENT';

  return makeSignal({
    studentId,
    signalType: 'REPEATED_SESSION_ABANDONMENT',
    label,
    severity: isRepeatedPattern ? 'WATCH' : 'INFO',
    confidence,
    evidenceCount: abandoned.length,
    observationWindowDays: windowDays,
    supportingMetrics: {
      abandonedCount: abandoned.length,
      avgProgressAtAbandonment: round2(avgPoint),
      spread: round2(spread),
    },
    explanation: isRepeatedPattern
      ? `${abandoned.length} sessions in the last ${windowDays} days were left unfinished at a similar point (around ${Math.round(avgPoint * 100)}% through). The exact cause isn't something behavior data alone can determine.`
      : `${abandoned.length} sessions in the last ${windowDays} days were left unfinished, at varying points rather than a consistent one.`,
    possibleExplanations: isRepeatedPattern
      ? [
          'The material around this point may be more difficult than earlier content',
          'The session length or format may not fit the time typically available',
          'An interruption or technical issue at a similar stage',
          'Reduced engagement at that point in the session',
        ]
      : undefined,
  });
}
