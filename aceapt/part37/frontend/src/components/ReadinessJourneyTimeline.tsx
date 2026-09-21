import { useEffect, useState } from 'react';
import { readinessClient } from '../api/readinessClient';
import type { JourneyEntry } from '../types';
import { StatusPill, readinessStateTone } from './shared';

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function ReadinessJourneyTimeline({ studentId, roleId }: { studentId: string; roleId: string }) {
  const [journey, setJourney] = useState<JourneyEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    readinessClient
      .getReadinessJourney(studentId, roleId)
      .then((res) => {
        if (!cancelled) setJourney(res.journey);
      })
      .catch(() => {
        if (!cancelled) setJourney([]);
      });
    return () => {
      cancelled = true;
    };
  }, [studentId, roleId]);

  return (
    <section className="rounded-card border border-paper-line bg-white/70 p-6 sm:p-8">
      <h2 className="text-lg font-semibold text-ink">Readiness journey</h2>

      {journey === null && <div className="mt-4 h-20 animate-pulse rounded-md bg-paper-dim" aria-hidden="true" />}

      {journey !== null && journey.length === 0 && (
        <p className="mt-3 text-sm text-ink/65">No readiness changes recorded yet — this fills in as evidence comes in.</p>
      )}

      {journey !== null && journey.length > 0 && (
        <ol className="mt-5 flex gap-4 overflow-x-auto pb-1">
          {journey.map((entry, i) => (
            <li key={i} className="flex w-40 shrink-0 flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-ink/70" aria-hidden="true" />
                {i < journey.length - 1 && <span className="h-px flex-1 bg-paper-line" aria-hidden="true" />}
              </div>
              <p className="font-mono text-[11px] text-ink/45">{formatShortDate(entry.occurredAt)}</p>
              <StatusPill tone={readinessStateTone(entry.state)}>{entry.stateLabel}</StatusPill>
              <p className="text-xs leading-snug text-ink/60">{entry.reasonSummary}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
