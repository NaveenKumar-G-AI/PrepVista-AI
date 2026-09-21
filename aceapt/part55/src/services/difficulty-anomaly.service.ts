import type pg from 'pg';
import { calibrationConfig } from '../config/calibration.config.js';
import type { AnomalyType, CalibrationComputation } from '../types/difficulty.types.js';

export interface AnomalyCandidate {
  type: AnomalyType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  details: Record<string, unknown>;
}

/**
 * Detects and persists anomalies (§63-68, §124, §138-140).
 *
 * INSUFFICIENT_DATA is deliberately NOT written as a row here — it's a
 * snapshot *status* (PROVISIONAL + low sample size), not an event needing
 * review, and the admin dashboard counts it directly off snapshots so the
 * anomaly queue isn't flooded with every brand-new question. The enum value
 * stays in the schema for that dashboard query and any future use, but
 * `detect()` never emits it.
 */
export class DifficultyAnomalyService {
  constructor(private readonly client: pg.PoolClient | pg.Pool) {}

  detect(
    computation: CalibrationComputation,
    context: { previousMedianTimeMs?: number | null } = {}
  ): AnomalyCandidate[] {
    const candidates: AnomalyCandidate[] = [];
    const { overall, discrimination, status, labelMismatch, category, initialCategory } = computation;
    const cfg = calibrationConfig.anomaly;

    // Only judge item-level anomalies once there's enough evidence to trust
    // them — a brand new question with 3 attempts is not "too easy."
    if (status === 'CALIBRATED') {
      if (overall.facility.facility >= cfg.tooEasyFacilityMin) {
        candidates.push({
          type: 'TOO_EASY',
          severity: 'MEDIUM',
          details: {
            facility: overall.facility.facility,
            sampleSize: overall.facility.sampleSize,
            note: 'Investigate: may be a simple item, overexposed, or targeting the wrong population.',
          },
        });
      }
      if (overall.facility.facility <= cfg.tooHardFacilityMax) {
        candidates.push({
          type: 'TOO_HARD',
          severity: 'MEDIUM',
          details: {
            facility: overall.facility.facility,
            sampleSize: overall.facility.sampleSize,
            note: 'Investigate: may be genuinely difficult, a prerequisite gap, ambiguous wording, or invalid — Feature 53/54 verdicts should be checked before relabeling.',
          },
        });
      }
    }

    if (labelMismatch && category && initialCategory) {
      candidates.push({
        type: 'LABEL_MISMATCH',
        severity: 'MEDIUM',
        details: { initialCategory, empiricalCategory: category, sampleSize: overall.facility.sampleSize },
      });
    }

    if (discrimination.reliable && discrimination.value !== null) {
      if (discrimination.value >= cfg.highVarianceMinGap) {
        candidates.push({
          type: 'HIGH_VARIANCE',
          severity: 'LOW',
          details: {
            topMinusBottomFacilityGap: discrimination.value,
            sampleSize: discrimination.sampleSize,
            note: 'Large performance gap by ability tercile — possible prerequisite sensitivity or subgroup effect, not necessarily a defect.',
          },
        });
      }
      if (discrimination.value <= cfg.weakDiscriminationMax) {
        candidates.push({
          type: 'WEAK_DISCRIMINATION',
          severity: 'MEDIUM',
          details: {
            topMinusBottomFacilityGap: discrimination.value,
            sampleSize: discrimination.sampleSize,
            note: 'Higher-ability students are not meaningfully outperforming lower-ability students on this item — check for ambiguity, trick wording, or bad distractors.',
          },
        });
      }
    }

    if (context.previousMedianTimeMs && overall.time.reliable && overall.time.medianMs) {
      const ratio = overall.time.medianMs / context.previousMedianTimeMs;
      if (ratio >= cfg.unexpectedTimeRatioHigh) {
        candidates.push({
          type: 'UNEXPECTEDLY_SLOW',
          severity: 'LOW',
          details: { previousMedianMs: context.previousMedianTimeMs, currentMedianMs: overall.time.medianMs, ratio },
        });
      } else if (ratio <= cfg.unexpectedTimeRatioLow) {
        candidates.push({
          type: 'UNEXPECTEDLY_FAST',
          severity: 'LOW',
          details: { previousMedianMs: context.previousMedianTimeMs, currentMedianMs: overall.time.medianMs, ratio },
        });
      }
    }

    return candidates;
  }

  /** Upserts by (question_version_id, type, status='OPEN') so a
   * still-ongoing issue gets refreshed rather than duplicated on every
   * calibration run. */
  async persist(
    tenantId: string,
    questionVersionId: string,
    snapshotId: string,
    candidates: AnomalyCandidate[]
  ): Promise<void> {
    for (const c of candidates) {
      const { rows } = await this.client.query<{ id: string }>(
        `SELECT id FROM difficulty_anomalies
         WHERE tenant_id = $1 AND question_version_id = $2 AND type::text = $3 AND status = 'OPEN'`,
        [tenantId, questionVersionId, c.type]
      );
      if (rows[0]) {
        await this.client.query(
          `UPDATE difficulty_anomalies SET snapshot_id = $1, severity = $2, details = $3, detected_at = now()
           WHERE id = $4`,
          [snapshotId, c.severity, JSON.stringify(c.details), rows[0].id]
        );
      } else {
        await this.client.query(
          `INSERT INTO difficulty_anomalies (tenant_id, question_version_id, snapshot_id, type, severity, details)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [tenantId, questionVersionId, snapshotId, c.type, c.severity, JSON.stringify(c.details)]
        );
      }
    }

    // Anything OPEN that wasn't re-detected this run gets auto-resolved —
    // an item that was TOO_EASY and no longer is shouldn't sit in the queue
    // forever waiting for a human to notice it healed itself.
    const stillOpenTypes = candidates.map((c) => c.type);
    await this.client.query(
      `UPDATE difficulty_anomalies
       SET status = 'RESOLVED', resolved_at = now(), resolved_by = 'SYSTEM'
       WHERE tenant_id = $1 AND question_version_id = $2 AND status = 'OPEN'
             AND NOT (type::text = ANY($3::text[]))`,
      [tenantId, questionVersionId, stillOpenTypes.length ? stillOpenTypes : ['__none__']]
    );
  }
}
