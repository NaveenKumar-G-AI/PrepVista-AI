import { BehaviorEvent } from '../../types/events';
import { BehaviorSignal } from '../../types/signals';
import { THRESHOLDS } from '../../config/thresholds';
import { activeDateKeys, withinWindow } from '../time';
import { groupBy, round2 } from '../utils';
import { computeSignalConfidence } from './confidenceScore';
import { makeSignal } from './signalFactory';

/**
 * Learning Load Intelligence (section 15) + Overtraining/Imbalance
 * (section 16). Both are conditional signals - they only fire when the
 * evidence supports them, never as a default state.
 *
 * Workload mismatch reads an assigned-item count from the latest plan
 * event's metadata (weakTopicsCount / assignedQuestionsCount /
 * assignedAssessmentsCount) - this codebase has no separate
 * curriculum/mastery model, so it is a deliberately simple proxy: assigned
 * item count vs. demonstrated daily throughput, flagged for human/planner
 * review, never used to silently resize the plan itself.
 */
export function detectWorkloadSignals(
  events: BehaviorEvent[],
  studentId: string,
  now: Date,
  windowDays: number = THRESHOLDS.windows.MEDIUM_DAYS,
): BehaviorSignal[] {
  const signals: BehaviorSignal[] = [];
  const windowed = withinWindow(events, now, windowDays);

  // --- Workload mismatch ---
  // Same reasoning as planAdherence.ts: a plan is state that persists
  // until superseded, so which plan is "current" is read from full
  // history, not window-limited.
  const planEvents = events
    .filter((e) => (e.type === 'PLAN_ACCEPTED' || e.type === 'PLAN_MODIFIED') && e.metadata)
    .sort((a, b) => a.occurredAtUtc.localeCompare(b.occurredAtUtc));
  const latestPlan = planEvents[planEvents.length - 1];
  const assignedQuestions = latestPlan?.metadata?.assignedQuestionsCount as number | undefined;

  const answered = windowed.filter((e) => e.type === 'QUESTION_ANSWERED');
  const activeDays = activeDateKeys(answered).length;

  if (assignedQuestions && activeDays > 0) {
    const dailyThroughput = answered.length / activeDays;
    const daysNeededAtCurrentPace = dailyThroughput > 0 ? assignedQuestions / dailyThroughput : Infinity;
    const impliesUnsustainablePace = dailyThroughput > 0 && assignedQuestions / windowDays > THRESHOLDS.workload.MAX_SUSTAINABLE_ITEMS_PER_DAY;

    if (impliesUnsustainablePace || daysNeededAtCurrentPace > windowDays * 2) {
      signals.push(
        makeSignal({
          studentId,
          signalType: 'WORKLOAD_MISMATCH',
          label: 'WORKLOAD_MAY_BE_EXCESSIVE',
          severity: 'WATCH',
          confidence: computeSignalConfidence({ evidenceCount: activeDays, recencyDays: 0, patternConsistency: 0.7 }),
          evidenceCount: activeDays,
          observationWindowDays: windowDays,
          supportingMetrics: {
            assignedQuestions,
            observedDailyThroughput: round2(dailyThroughput),
            impliedDaysToComplete: Number.isFinite(daysNeededAtCurrentPace) ? Math.round(daysNeededAtCurrentPace) : null,
          },
          explanation: `The current plan includes ${assignedQuestions} questions. At the recently observed pace (${round2(dailyThroughput)}/day), completing it would take meaningfully longer than the plan's own timeframe. Worth reviewing plan size against demonstrated pace.`,
        }),
      );
    }
  }

  // --- Practice distribution imbalance ---
  const topicAnswers = answered.filter((e) => e.topicId);
  if (topicAnswers.length >= THRESHOLDS.challengeEngagement.MIN_QUESTIONS_FOR_SIGNAL) {
    const byTopic = groupBy(topicAnswers, (e) => e.topicId as string);
    const topicCounts = Array.from(byTopic.entries()).map(([topicId, items]) => ({ topicId, count: items.length }));
    const total = topicAnswers.length;
    topicCounts.sort((a, b) => b.count - a.count);
    const top = topicCounts[0];
    const otherTopicsCount = topicCounts.length - 1;
    const topShare = top.count / total;

    if (topShare >= THRESHOLDS.workload.IMBALANCE_MIN_TOPIC_SHARE && otherTopicsCount >= THRESHOLDS.workload.IMBALANCE_MIN_OTHER_WEAK_TOPICS) {
      signals.push(
        makeSignal({
          studentId,
          signalType: 'PRACTICE_DISTRIBUTION_IMBALANCE',
          label: 'CONCENTRATED_ON_ONE_TOPIC',
          severity: 'INFO',
          confidence: computeSignalConfidence({ evidenceCount: total, recencyDays: 0, patternConsistency: 0.8 }),
          evidenceCount: total,
          observationWindowDays: windowDays,
          supportingMetrics: { topTopicId: top.topicId, topTopicShare: round2(topShare), otherTopicsTouched: otherTopicsCount },
          explanation: `${Math.round(topShare * 100)}% of your recent practice was on one topic, while ${otherTopicsCount} other topic${otherTopicsCount === 1 ? '' : 's'} received comparatively little attention.`,
        }),
      );
    }
  }

  return signals;
}
