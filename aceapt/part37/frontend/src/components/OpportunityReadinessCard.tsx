import { useEffect, useState } from 'react';
import { readinessClient } from '../api/readinessClient';
import type { ReadinessDTO } from '../types';
import { READABLE_STATE, StatusPill, readinessStateTone } from './shared';

/**
 * Brief, section 24. The list of opportunity ids to check is passed in
 * rather than fetched here — in a real deployment those ids come from
 * Feature 33 (see OpportunityProvider.getRecommendedOpportunityIds), which
 * has no real backing in this build (see README) and honestly returns none
 * by default rather than guessing. Renders nothing when there's nothing to
 * show, rather than an empty-looking card.
 */
export function OpportunityReadinessCard({ studentId, opportunityIds }: { studentId: string; opportunityIds: string[] }) {
  const [results, setResults] = useState<Array<{ opportunityId: string; data: ReadinessDTO | null }>>([]);

  useEffect(() => {
    if (opportunityIds.length === 0) {
      setResults([]);
      return;
    }
    let cancelled = false;
    Promise.all(
      opportunityIds.map(async (id) => {
        try {
          const data = await readinessClient.getOpportunityReadiness(studentId, id);
          return { opportunityId: id, data };
        } catch {
          return { opportunityId: id, data: null };
        }
      })
    ).then((res) => {
      if (!cancelled) setResults(res);
    });
    return () => {
      cancelled = true;
    };
  }, [studentId, opportunityIds]);

  if (opportunityIds.length === 0) return null;

  return (
    <section className="rounded-card border border-paper-line bg-white/70 p-6 sm:p-8">
      <h2 className="text-lg font-semibold text-ink">Opportunity readiness</h2>
      <ul className="mt-4 divide-y divide-paper-line">
        {results.map(({ opportunityId, data }) => (
          <li key={opportunityId} className="flex items-center justify-between gap-3 py-3">
            <span className="font-medium text-ink">{data?.roleName ?? opportunityId}</span>
            {data ? (
              <StatusPill tone={readinessStateTone(data.state)}>{READABLE_STATE[data.state]}</StatusPill>
            ) : (
              <span className="font-mono text-xs text-ink/40">unavailable</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
