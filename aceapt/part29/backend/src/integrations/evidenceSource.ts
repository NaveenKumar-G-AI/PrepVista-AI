import { CapabilityEvidenceEvent } from '../domain/types';
import { pool } from '../db/pool';

/**
 * ALIGN does not originate evidence — it consumes it (spec §11: "reuse
 * existing ACEAPT data structures"). This interface is the seam: swap
 * `postgresEvidenceSource` below for an implementation that queries
 * whatever Feature 3/5/6/8/20 actually use (a view, a join across their
 * attempt tables, a call to their service) and nothing else in this
 * module needs to change.
 */
export interface EvidenceSource {
  getEvidenceForStudent(studentId: string): Promise<Record<string, CapabilityEvidenceEvent[]>>;
}

interface EvidenceRow {
  capability_id: string;
  performance: number;
  occurred_at: string;
  difficulty: number;
  novelty: number;
  timed: boolean;
  proof_verified: boolean;
  source_ref: string | null;
}

/**
 * Reference implementation reading capability_evidence_events — the
 * fallback table created by migration 001 so this module runs standalone.
 * Uses the service role via the pool directly (RLS still applies; service
 * bypasses it by policy, see migrations/001_align_schema.sql) since
 * evidence aggregation is an internal read across whatever the caller
 * already established is the right student.
 */
export const postgresEvidenceSource: EvidenceSource = {
  async getEvidenceForStudent(studentId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.actor_role', 'service', true)");
      const result = await client.query<EvidenceRow>(
        `SELECT capability_id, performance, occurred_at, difficulty, novelty, timed, proof_verified, source_ref
         FROM capability_evidence_events
         WHERE student_id = $1
         ORDER BY occurred_at ASC`,
        [studentId],
      );
      await client.query('COMMIT');

      const byCapability: Record<string, CapabilityEvidenceEvent[]> = {};
      for (const row of result.rows) {
        const event: CapabilityEvidenceEvent = {
          capabilityId: row.capability_id,
          performance: row.performance,
          occurredAt: new Date(row.occurred_at).toISOString(),
          difficulty: row.difficulty,
          novelty: row.novelty,
          timed: row.timed,
          proofVerified: row.proof_verified,
          sourceRef: row.source_ref ?? undefined,
        };
        (byCapability[row.capability_id] ??= []).push(event);
      }
      return byCapability;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  },
};
