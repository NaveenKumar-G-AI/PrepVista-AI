// modules/proactive/detectors/development.ts
//
// Training + readiness detectors. Readiness detection leans on the
// small-sample safeguard from services/anomaly — sections 28 and 52 are
// explicit that tiny cohorts and single-point swings must not read as
// alerts.

import type { Detector, DetectorContext } from '../detectorFramework';
import type { SignalCandidate } from '../../../services/signals/types';
import { checkSampleSufficiency } from '../../../services/anomaly/anomalyEngine';

function avg(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export const trainingLowAttendance: Detector = {
  signalType: 'TRAINING_LOW_ATTENDANCE',
  triggeredByEvents: ['TRAINING_ATTENDANCE_RECORDED', 'TRAINING_COMPLETED'],
  async runScheduled(ctx: DetectorContext): Promise<SignalCandidate[]> {
    const rows = await ctx.dataSource.getTrainingAttendance(ctx.institutionId, ctx.seasonId);
    const out: SignalCandidate[] = [];

    for (const row of rows) {
      if (row.belowThresholdCount <= 0) continue;
      const sample = checkSampleSufficiency(row.totalEnrolled, 10);
      if (!sample.sufficient) continue; // section 52 — small cohorts stay silent, not alarmed

      out.push({
        institutionId: ctx.institutionId,
        seasonId: ctx.seasonId,
        signalType: 'TRAINING_LOW_ATTENDANCE',
        category: 'TRAINING',
        polarity: 'RISK',
        entityType: 'TRAINING',
        entityId: row.trainingId,
        departmentTag: row.departmentTag,
        title: `${row.belowThresholdCount} students have fallen below the required training attendance threshold`,
        summary: `Required rate is ${row.requiredRate}%; ${row.belowThresholdCount} of ${row.totalEnrolled} enrolled students are below it.`,
        evidence: { below_threshold: row.belowThresholdCount, total_enrolled: row.totalEnrolled, required_rate: row.requiredRate },
        evidenceMeta: { dataAsOf: row.dataAsOf, isStale: false },
        confidence: 'HIGH_CONFIDENCE',
        studentsAffected: row.belowThresholdCount,
        hoursUntilDeadline: null,
        recommendedAction: {
          type: 'REVIEW_STUDENT_LIST',
          label: 'Review students below attendance threshold',
          requiresConfirmation: true,
          targetQuery: { trainingId: row.trainingId, attendanceBelowThreshold: true },
        },
        audiences: ['TPO'],
      });
    }

    return out;
  },
};

export const readinessSignificantDecline: Detector = {
  signalType: 'READINESS_SIGNIFICANT_DECLINE',
  triggeredByEvents: ['READINESS_UPDATED', 'READINESS_DECLINED'],
  async runScheduled(ctx: DetectorContext): Promise<SignalCandidate[]> {
    const movements = await ctx.dataSource.getReadinessMovements(ctx.institutionId, ctx.seasonId);

    // A meaningful decline: at least 10 points, measured over at least 7
    // days, so a single bad-day dip on a short window can't trigger it
    // (section 28's "do not alert on tiny score fluctuations").
    const declined = movements.filter((m) => m.previousScore - m.currentScore >= 10 && m.measuredOverDays >= 7 && !m.milestoneReached);
    if (declined.length === 0) return [];

    const byDept = new Map<string, typeof declined>();
    for (const m of declined) {
      const key = m.departmentTag ?? 'institution';
      byDept.set(key, [...(byDept.get(key) ?? []), m]);
    }

    const out: SignalCandidate[] = [];
    for (const [dept, rows] of byDept) {
      const sample = checkSampleSufficiency(rows.length, 5);

      out.push({
        institutionId: ctx.institutionId,
        seasonId: ctx.seasonId,
        signalType: 'READINESS_SIGNIFICANT_DECLINE',
        category: 'READINESS',
        polarity: 'RISK',
        entityType: dept === 'institution' ? 'INSTITUTION' : 'DEPARTMENT',
        entityId: dept,
        departmentTag: dept === 'institution' ? undefined : dept,
        title: `${rows.length} students experienced a significant readiness decline`,
        summary: sample.sufficient
          ? `Average drop of ${Math.round(avg(rows.map((r) => r.previousScore - r.currentScore)))} points over the last week or more.`
          : sample.note!,
        evidence: {
          students_affected: rows.length,
          average_decline: Math.round(avg(rows.map((r) => r.previousScore - r.currentScore))),
          window_days_min: Math.min(...rows.map((r) => r.measuredOverDays)),
        },
        evidenceMeta: { dataAsOf: rows[0].dataAsOf, isStale: false },
        confidence: sample.sufficient ? 'HIGH_CONFIDENCE' : 'LOW_CONFIDENCE',
        studentsAffected: rows.length,
        hoursUntilDeadline: null,
        recommendedAction: {
          type: 'REVIEW_STUDENT_LIST',
          label: 'Review students with declining readiness',
          requiresConfirmation: true,
          targetQuery: { departmentTag: dept === 'institution' ? undefined : dept, readinessTrend: 'DECLINING' },
        },
        audiences: ['TPO'],
      });
    }

    return out;
  },
};
