import { Response } from 'express';
import { AuthedRequest } from '../middleware/auth';
import { pool } from '../../db/pool';
import { AlignmentGap, AlignmentState } from '../../domain/types';

/**
 * spec §60-61: cohort-level target alignment + top gaps. This is
 * intentionally an MVP — it aggregates across every student the 'tpo'
 * role can see (all of them, per the RLS policy in migration 001), with
 * no institution/cohort scoping, because this reference build has no real
 * institution model to scope by. A production wiring should add an
 * institution_id (or cohort_id) column/join here matching whatever
 * PrepVista's actual student/institution schema looks like, and filter by
 * the caller's own institution — see docs/INTEGRATION.md.
 */

interface CohortRow {
  target_id: string;
  target_name: string;
  alignment_state: AlignmentState;
  count: string;
}

interface GapRow {
  gap: AlignmentGap;
}

export async function getCohortOverview(_req: AuthedRequest, res: Response): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.actor_role', 'tpo', true)");

    const cohort = await client.query<CohortRow>(
      `SELECT ar.target_id, tp.name as target_name, ar.alignment_state, count(*)::text as count
       FROM alignment_results ar
       JOIN target_profiles tp ON tp.target_id = ar.target_id
       GROUP BY ar.target_id, tp.name, ar.alignment_state
       ORDER BY tp.name, ar.alignment_state`,
    );

    const gapRows = await client.query<GapRow>(
      `SELECT jsonb_array_elements(critical_gaps) as gap FROM alignment_results
       UNION ALL
       SELECT jsonb_array_elements(supporting_gaps) as gap FROM alignment_results`,
    );

    await client.query('COMMIT');

    const byTarget = new Map<string, { targetName: string; counts: Record<AlignmentState, number> }>();
    for (const row of cohort.rows) {
      const entry = byTarget.get(row.target_id) ?? {
        targetName: row.target_name,
        counts: { STRONGLY_ALIGNED: 0, DEVELOPING_ALIGNMENT: 0, LOW_ALIGNMENT: 0, INSUFFICIENT_EVIDENCE: 0 },
      };
      entry.counts[row.alignment_state] = Number(row.count);
      byTarget.set(row.target_id, entry);
    }

    const gapCounts = new Map<string, { capabilityName: string; count: number }>();
    for (const row of gapRows.rows) {
      const gap = row.gap as unknown as AlignmentGap;
      const existing = gapCounts.get(gap.capabilityId) ?? { capabilityName: gap.capabilityName, count: 0 };
      existing.count += 1;
      gapCounts.set(gap.capabilityId, existing);
    }
    const topGaps = [...gapCounts.values()].sort((a, b) => b.count - a.count).slice(0, 8);

    res.json({
      targets: [...byTarget.entries()].map(([targetId, v]) => ({ targetId, ...v })),
      topCohortGaps: topGaps,
      note:
        'MVP aggregate across all visible students — not yet scoped to a single institution/cohort. See docs/INTEGRATION.md.',
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
