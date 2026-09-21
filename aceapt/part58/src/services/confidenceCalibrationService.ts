/**
 * ConfidenceCalibrationService (§52-59, §128, §135, §165-166). Feature 34
 * supplies confidence; this service only ever compares it against outcomes
 * that have already happened — it never generates or adjusts confidence.
 */
import type { AnalyticsPublisher } from '../ports';
import type { CalibrationRepository, DecisionEventRepository } from '../repositories/types';
import { computeCalibrationByBand, detectMisalignment, type Misalignment } from '../domain/calibration';
import type { CalibrationSnapshot, ConfidenceBand } from '../types';

export class ConfidenceCalibrationService {
  constructor(
    private readonly events: DecisionEventRepository,
    private readonly calibrationRepo: CalibrationRepository,
    private readonly analytics: AnalyticsPublisher
  ) {}

  async computeAndStoreSnapshot(tenantId: string, studentId: string, sinceISO?: string): Promise<CalibrationSnapshot[]> {
    const decisions = await this.events.listByStudent(tenantId, studentId, { since: sinceISO, limit: 200 });
    const points = decisions
      .filter((d): d is typeof d & { confidenceBand: ConfidenceBand; isCorrect: boolean } => !!d.confidenceBand && d.isCorrect !== null)
      .map((d) => ({ band: d.confidenceBand, isCorrect: d.isCorrect }));

    const byBand = computeCalibrationByBand(points);
    const periodEnd = new Date().toISOString();
    const periodStart = sinceISO ?? decisions.at(-1)?.createdAt ?? periodEnd;

    const snapshots: CalibrationSnapshot[] = [];
    for (const band of Object.keys(byBand) as ConfidenceBand[]) {
      const { accuracy, sampleSize } = byBand[band];
      if (sampleSize === 0) continue;
      snapshots.push(
        await this.calibrationRepo.upsertSnapshot({
          tenantId,
          studentId,
          confidenceBand: band,
          observedAccuracy: accuracy,
          sampleSize,
          periodStart,
          periodEnd,
        })
      );
    }

    if (snapshots.length > 0) {
      await this.analytics.publish('confidence_calibration_updated', { tenantId, studentId, bandsUpdated: snapshots.length });
    }
    return snapshots;
  }

  async getMisalignments(tenantId: string, studentId: string): Promise<Misalignment[]> {
    const snapshots = await this.calibrationRepo.listForStudent(tenantId, studentId);
    const byBand = Object.fromEntries(
      snapshots.map((s) => [s.confidenceBand, { accuracy: s.observedAccuracy, sampleSize: s.sampleSize }])
    ) as Record<ConfidenceBand, { accuracy: number; sampleSize: number }>;
    for (const band of ['VERY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'] as ConfidenceBand[]) {
      if (!byBand[band]) byBand[band] = { accuracy: 0, sampleSize: 0 };
    }
    return detectMisalignment(byBand);
  }
}
