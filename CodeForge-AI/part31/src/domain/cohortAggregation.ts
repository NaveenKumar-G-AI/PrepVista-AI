import type { CohortReadinessSummary, ReadinessResult, ReadinessState } from './types';

function emptyStateMap(): Record<ReadinessState, number> {
  return {
    NOT_ASSESSED: 0,
    EARLY_STAGE: 0,
    DEVELOPING: 0,
    APPROACHING_READY: 0,
    READY: 0,
    STRONGLY_READY: 0,
  };
}

/**
 * Phase 40/41 — cohort intelligence, built as a pure aggregation over
 * already-computed, already-authorized ReadinessResult objects. This
 * function does no database access and no authorization check itself —
 * the caller (an API handler gated by canViewCohortAggregate) is
 * responsible for fetching only results the actor is allowed to see and
 * for tenant-scoping the query (Phase 42).
 */
export function aggregateCohortReadiness(results: ReadinessResult[]): CohortReadinessSummary {
  if (results.length === 0) {
    return { roleId: '', totalStudents: 0, byState: emptyStateMap(), mostCommonBlockers: [] };
  }

  const roleId = results[0].roleId;
  const byState = emptyStateMap();
  const blockerCounts = new Map<string, { skillName: string; count: number }>();

  for (const result of results) {
    byState[result.readinessState] += 1;
    for (const blocker of result.blockers) {
      const entry = blockerCounts.get(blocker.skillId) ?? { skillName: blocker.skillName, count: 0 };
      entry.count += 1;
      blockerCounts.set(blocker.skillId, entry);
    }
  }

  const mostCommonBlockers = [...blockerCounts.entries()]
    .map(([skillId, v]) => ({ skillId, skillName: v.skillName, count: v.count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return { roleId, totalStudents: results.length, byState, mostCommonBlockers };
}
