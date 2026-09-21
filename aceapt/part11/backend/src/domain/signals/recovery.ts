import { BehaviorEvent } from '../../types/events';
import { BehaviorSignal } from '../../types/signals';
import { THRESHOLDS } from '../../config/thresholds';
import { computeSignalConfidence } from './confidenceScore';
import { makeSignal, insufficientEvidenceSignal } from './signalFactory';

/**
 * Recovery Intelligence (section 6). For every poor assessment result,
 * looks at the following LOOKBACK_DAYS_AFTER_POOR_RESULT window:
 *  - STRONG: targeted practice activity followed, and/or a retake scored higher
 *  - WEAK: little to no activity followed, or a retake repeated a similar score
 *  - RECOVERY_UNCERTAIN: mixed or ambiguous evidence
 * Looks at the student's full history (not window-limited) because a poor
 * result can be rare and old data is exactly what's needed to judge the
 * response to it.
 */
export function detectRecoverySignal(events: BehaviorEvent[], studentId: string, now: Date): BehaviorSignal {
  const windowDays = THRESHOLDS.windows.LONG_DAYS;
  const completedAssessments = events
    .filter((e) => e.type === 'ASSESSMENT_COMPLETED' && typeof e.scoreFraction === 'number')
    .sort((a, b) => a.occurredAtUtc.localeCompare(b.occurredAtUtc));

  const poorResults = completedAssessments.filter((e) => (e.scoreFraction as number) <= THRESHOLDS.recovery.POOR_ASSESSMENT_SCORE_MAX);

  if (poorResults.length < THRESHOLDS.recovery.MIN_POOR_ASSESSMENTS_FOR_SIGNAL) {
    return insufficientEvidenceSignal({
      studentId,
      signalType: 'RECOVERY_PATTERN',
      observationWindowDays: windowDays,
      explanation: 'No below-target assessment results recorded yet, so there is nothing to evaluate recovery from.',
    });
  }

  let strongCount = 0;
  let weakCount = 0;

  for (const poor of poorResults) {
    const poorTime = new Date(poor.occurredAtUtc).getTime();
    const lookbackCutoff = poorTime + THRESHOLDS.recovery.LOOKBACK_DAYS_AFTER_POOR_RESULT * 86_400_000;

    const followingActivity = events.filter((e) => {
      const t = new Date(e.occurredAtUtc).getTime();
      return t > poorTime && t <= lookbackCutoff;
    });

    const targetedPractice = followingActivity.filter(
      (e) => e.type === 'QUESTION_ANSWERED' && (!poor.topicId || e.topicId === poor.topicId),
    ).length;

    const retake = followingActivity.find(
      (e) => e.type === 'ASSESSMENT_COMPLETED' && typeof e.scoreFraction === 'number' && (!poor.assessmentId || e.topicId === poor.topicId),
    );
    const improvedOnRetake = retake && (retake.scoreFraction as number) > (poor.scoreFraction as number);

    if (targetedPractice >= 3 || improvedOnRetake) strongCount += 1;
    else if (targetedPractice === 0 && followingActivity.length === 0) weakCount += 1;
    else if (retake && !improvedOnRetake) weakCount += 1;
  }

  const total = poorResults.length;
  const label = strongCount / total >= 0.6 ? 'STRONG' : weakCount / total >= 0.6 ? 'WEAK' : 'UNCERTAIN';

  const confidence = computeSignalConfidence({ evidenceCount: total, recencyDays: 0, patternConsistency: Math.max(strongCount, weakCount) / total });

  const explanation =
    label === 'STRONG'
      ? `After below-target results, you typically returned with targeted practice or an improved retake (seen in ${strongCount} of ${total} cases). That's a strong recovery pattern.`
      : label === 'WEAK'
        ? `After below-target results, there was often little follow-up activity or a repeated similar result (seen in ${weakCount} of ${total} cases).`
        : `Your response after below-target results has been mixed - sometimes followed by targeted practice, sometimes not (${total} case${total === 1 ? '' : 's'} observed).`;

  return makeSignal({
    studentId,
    signalType: 'RECOVERY_PATTERN',
    label,
    severity: label === 'WEAK' ? 'WATCH' : 'INFO',
    confidence,
    evidenceCount: total,
    observationWindowDays: windowDays,
    supportingMetrics: { poorResultsObserved: total, strongRecoveryCases: strongCount, weakRecoveryCases: weakCount },
    explanation,
  });
}
