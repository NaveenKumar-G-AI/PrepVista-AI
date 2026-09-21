import type pg from 'pg';
import { withTenant } from '../db/pool.js';

export type ReviewActionType = 'APPROVE' | 'HOLD' | 'REQUEST_RECALIBRATION' | 'DISMISS';

/**
 * §122: authorized users can review/approve/hold/request-recalibration, but
 * never edit a snapshot's numbers directly — this only ever writes an
 * append-only review_actions row and moves the anomaly's status, never the
 * underlying evidence.
 */
export class DifficultyReviewService {
  constructor(private readonly pool: pg.Pool) {}

  async submitReview(args: {
    tenantId: string;
    questionVersionId: string;
    anomalyId: string | null;
    action: ReviewActionType;
    actor: string;
    notes?: string;
  }): Promise<void> {
    await withTenant(this.pool, args.tenantId, async (client) => {
      await client.query(
        `INSERT INTO difficulty_review_actions
          (tenant_id, question_version_id, anomaly_id, action, actor, notes)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [args.tenantId, args.questionVersionId, args.anomalyId, args.action, args.actor, args.notes ?? null]
      );

      if (args.anomalyId) {
        const newStatus =
          args.action === 'DISMISS' ? 'DISMISSED' : args.action === 'APPROVE' ? 'RESOLVED' : 'REVIEWING';
        const isTerminal = newStatus === 'DISMISSED' || newStatus === 'RESOLVED';
        await client.query(
          `UPDATE difficulty_anomalies
           SET status = $1::anomaly_status,
               resolved_at = CASE WHEN $2 THEN now() ELSE resolved_at END,
               resolved_by = CASE WHEN $2 THEN $3 ELSE resolved_by END
           WHERE id = $4 AND tenant_id = $5`,
          [newStatus, isTerminal, args.actor, args.anomalyId, args.tenantId]
        );
      }
    });
  }
}
