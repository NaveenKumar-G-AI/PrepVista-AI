import { BehaviorEvent } from '../../types/events';
import { BehaviorSignal } from '../../types/signals';
import { THRESHOLDS } from '../../config/thresholds';
import { activeDateKeys, localDateKey, withinWindow } from '../time';
import { groupBy, mean, round2 } from '../utils';
import { computeSignalConfidence } from './confidenceScore';
import { makeSignal, insufficientEvidenceSignal } from './signalFactory';

/**
 * Learning Rhythm (section 10). Buckets completed sessions by duration and
 * compares accuracy across buckets. Only calls out a preference when one
 * bucket has enough samples AND a real accuracy edge over the runner-up -
 * otherwise reports insufficient evidence rather than a coin-flip label.
 * Deliberately makes no biological/psychological claim (section 10) - the
 * explanation is scoped strictly to "performance by session length."
 */
export function detectLearningRhythmSignal(
  events: BehaviorEvent[],
  studentId: string,
  now: Date,
  windowDays: number = THRESHOLDS.windows.LONG_DAYS,
): BehaviorSignal {
  const windowed = withinWindow(events, now, windowDays);
  const sessions = windowed.filter((e) => e.type === 'SESSION_COMPLETED' && typeof e.durationSeconds === 'number');

  if (sessions.length === 0) {
    return insufficientEvidenceSignal({
      studentId,
      signalType: 'LEARNING_RHYTHM_PREFERENCE',
      observationWindowDays: windowDays,
      explanation: 'Not enough completed sessions yet to determine a session-length pattern.',
    });
  }

  const edges = THRESHOLDS.learningRhythm.DURATION_BUCKET_EDGES_MINUTES;
  const bucketLabel = (minutes: number): string => {
    if (minutes < edges[0]) return `Under ${edges[0]} min`;
    if (minutes < edges[1]) return `${edges[0]}-${edges[1]} min`;
    if (minutes < edges[2]) return `${edges[1]}-${edges[2]} min`;
    return `${edges[2]}+ min`;
  };

  const withAccuracy = sessions.map((s) => {
    const minutes = (s.durationSeconds as number) / 60;
    const sessionAnswers = windowed.filter((e) => e.type === 'QUESTION_ANSWERED' && e.sessionId === s.sessionId);
    const correct = sessionAnswers.filter((e) => e.correct).length;
    return { bucket: bucketLabel(minutes), accuracy: sessionAnswers.length > 0 ? correct / sessionAnswers.length : null };
  });

  const byBucket = groupBy(
    withAccuracy.filter((s) => s.accuracy !== null) as { bucket: string; accuracy: number }[],
    (s) => s.bucket,
  );

  const bucketStats = Array.from(byBucket.entries())
    .map(([bucket, items]) => ({ bucket, count: items.length, avgAccuracy: mean(items.map((i) => i.accuracy)) }))
    .filter((b) => b.count >= THRESHOLDS.learningRhythm.MIN_SESSIONS_PER_BUCKET)
    .sort((a, b) => b.avgAccuracy - a.avgAccuracy);

  const confidence = computeSignalConfidence({ evidenceCount: sessions.length, recencyDays: 0, patternConsistency: 1 });

  if (bucketStats.length < 2 || (bucketStats[0].avgAccuracy - bucketStats[1].avgAccuracy) * 100 < THRESHOLDS.learningRhythm.MIN_ACCURACY_ADVANTAGE_POINTS) {
    return insufficientEvidenceSignal({
      studentId,
      signalType: 'LEARNING_RHYTHM_PREFERENCE',
      observationWindowDays: windowDays,
      explanation: 'Not enough of a consistent accuracy difference between session lengths yet to call out a preference.',
    });
  }

  const best = bucketStats[0];
  return makeSignal({
    studentId,
    signalType: 'LEARNING_RHYTHM_PREFERENCE',
    label: best.bucket,
    severity: 'INFO',
    confidence,
    evidenceCount: sessions.length,
    observationWindowDays: windowDays,
    supportingMetrics: { bucketStats: bucketStats.map((b) => ({ ...b, avgAccuracy: round2(b.avgAccuracy) })) },
    explanation: `You currently perform best in ${best.bucket} sessions (${Math.round(best.avgAccuracy * 100)}% accuracy across ${best.count} sessions), compared to other session lengths you've tried.`,
  });
}

/**
 * Cramming Pattern (section 11): low activity for several consecutive days
 * followed by a disproportionate single-day spike. Purely descriptive -
 * the brief is explicit that long sessions are not automatically bad.
 */
export function detectCrammingSignal(events: BehaviorEvent[], studentId: string, now: Date): BehaviorSignal | null {
  const windowDays = THRESHOLDS.windows.LONG_DAYS;
  const windowed = withinWindow(
    events.filter((e) => typeof e.durationSeconds === 'number' && (e.type === 'SESSION_COMPLETED' || e.type === 'SESSION_ABANDONED')),
    now,
    windowDays,
  );
  if (windowed.length === 0) return null;

  const minutesByDay = new Map<string, number>();
  for (const e of windowed) {
    const day = localDateKey(e);
    minutesByDay.set(day, (minutesByDay.get(day) ?? 0) + (e.durationSeconds as number) / 60);
  }

  const days = activeDateKeys(windowed);
  if (days.length < THRESHOLDS.cramming.LOW_ACTIVITY_MIN_CONSECUTIVE_DAYS + 1) return null;

  // Walk the active days looking for: several low-activity days, then a spike well above the trailing average.
  for (let i = THRESHOLDS.cramming.LOW_ACTIVITY_MIN_CONSECUTIVE_DAYS; i < days.length; i++) {
    const trailing = days.slice(Math.max(0, i - THRESHOLDS.cramming.LOW_ACTIVITY_MIN_CONSECUTIVE_DAYS), i);
    const trailingAllLow = trailing.every((d) => (minutesByDay.get(d) ?? 0) <= THRESHOLDS.cramming.LOW_ACTIVITY_MINUTES_PER_DAY);
    const trailingAvg = mean(trailing.map((d) => minutesByDay.get(d) ?? 0)) || 1;
    const todayMinutes = minutesByDay.get(days[i]) ?? 0;

    if (trailingAllLow && todayMinutes >= trailingAvg * THRESHOLDS.cramming.SPIKE_MULTIPLIER_OF_ROLLING_AVERAGE && todayMinutes > 30) {
      return makeSignal({
        studentId,
        signalType: 'CRAMMING_PATTERN',
        label: 'CRAMMING_DETECTED',
        severity: 'INFO',
        confidence: computeSignalConfidence({ evidenceCount: 1, recencyDays: 0, patternConsistency: 0.7 }),
        evidenceCount: 1,
        observationWindowDays: windowDays,
        supportingMetrics: { lowActivityDays: trailing.length, spikeDay: days[i], spikeMinutes: round2(todayMinutes) },
        explanation: `Your activity shows a pattern of low or no preparation for several days, followed by a concentrated ${Math.round(todayMinutes)}-minute session on ${days[i]}.`,
      });
    }
  }

  return null;
}
