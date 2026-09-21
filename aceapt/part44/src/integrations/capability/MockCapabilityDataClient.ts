// Stand-in for the real Feature 43 client, used only so this reference
// implementation is runnable end-to-end and testable. Reads from
// mock_capability_snapshots (see db/migrations/002) - a table that does
// not exist in the real ACEAPT schema.
import type pg from "pg";
import type { CapabilityDataClient } from "./CapabilityDataClient.js";
import type { CapabilityDimension, CapabilitySnapshot, SpeedBand } from "../../domain/types.js";

const DIMENSION_COLUMNS: CapabilityDimension[] = [
  "quant",
  "logical",
  "verbal",
  "probability",
  "data_interpretation",
];

export class MockCapabilityDataClient implements CapabilityDataClient {
  constructor(private readonly pool: pg.Pool) {}

  async getLatestSnapshot(studentId: string): Promise<CapabilitySnapshot | null> {
    // Note: mock_capability_snapshots has no RLS - it is explicitly not
    // goal-owned data, so this query is not run through
    // withStudentContext. The real Feature 43 client will have its own
    // access-control story, which Feature 44 does not need to know about.
    const res = await this.pool.query(
      `SELECT * FROM mock_capability_snapshots WHERE student_id = $1 ORDER BY assessed_at DESC LIMIT 1`,
      [studentId]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];

    const scores: Partial<Record<CapabilityDimension, number>> = {};
    for (const dim of DIMENSION_COLUMNS) {
      if (row[dim] !== null && row[dim] !== undefined) {
        scores[dim] = Number(row[dim]);
      }
    }

    const snapshot: CapabilitySnapshot = {
      studentId,
      assessedAt: row.assessed_at.toISOString(),
      scores,
      accuracy: row.accuracy !== null ? Number(row.accuracy) : undefined,
      speedBand: (row.speed_band as SpeedBand) ?? undefined,
      consistency: row.consistency !== null ? Number(row.consistency) : undefined,
      improvementRatePerHour: row.improvement_rate_per_hour ?? undefined,
    };
    return snapshot;
  }
}
