// ============================================================================
// KnowledgeHealthDashboard
//
// Matches the brief's mockup:
//
//   Strong      ██████████
//   Stable      ████████
//   Weakening   ████
//   Needs recall ██
//
// Bars are proportional to each band's share of the student's total tracked
// concepts. Assumes Tailwind is available in the host app — restyle freely,
// the fetch/state logic is the part worth keeping as-is.
// ============================================================================

import { useEffect, useState } from 'react';

export interface DashboardBandCounts {
  strong: number;
  stable: number;
  weakening: number;
  needsRecall: number;
  total: number;
}

export interface KnowledgeHealthDashboardProps {
  studentId: string;
  apiBaseUrl?: string;
}

const BANDS: Array<{ key: keyof Omit<DashboardBandCounts, 'total'>; label: string; barClass: string }> = [
  { key: 'strong', label: 'Strong', barClass: 'bg-emerald-500' },
  { key: 'stable', label: 'Stable', barClass: 'bg-sky-500' },
  { key: 'weakening', label: 'Weakening', barClass: 'bg-amber-500' },
  { key: 'needsRecall', label: 'Needs recall', barClass: 'bg-rose-500' },
];

export default function KnowledgeHealthDashboard({ studentId, apiBaseUrl = '/api/feature19' }: KnowledgeHealthDashboardProps) {
  const [counts, setCounts] = useState<DashboardBandCounts | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);

    fetch(`${apiBaseUrl}/students/${encodeURIComponent(studentId)}/dashboard`)
      .then(res => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return res.json() as Promise<DashboardBandCounts>;
      })
      .then(data => {
        if (!cancelled) setCounts(data);
      })
      .catch(err => {
        if (!cancelled) setError(err.message ?? 'Could not load the dashboard.');
      });

    return () => {
      cancelled = true;
    };
  }, [studentId, apiBaseUrl]);

  if (error) {
    return <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">Couldn't load the dashboard. {error}</div>;
  }
  if (!counts) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 animate-pulse">
        <div className="h-4 w-48 rounded bg-slate-200 mb-4" />
        {BANDS.map(b => (
          <div key={b.key} className="h-3 w-full rounded bg-slate-100 mb-3" />
        ))}
      </div>
    );
  }

  const max = Math.max(1, counts.strong, counts.stable, counts.weakening, counts.needsRecall);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="text-base font-semibold text-slate-900">Knowledge Health</h3>
      <p className="mt-1 text-xs text-slate-500">{counts.total} concept{counts.total === 1 ? '' : 's'} tracked</p>

      <div className="mt-4 space-y-3">
        {BANDS.map(band => {
          const value = counts[band.key];
          const widthPct = Math.max(value > 0 ? 6 : 0, Math.round((value / max) * 100));
          return (
            <div key={band.key} className="flex items-center gap-3">
              <span className="w-24 shrink-0 text-xs font-medium text-slate-600">{band.label}</span>
              <div className="h-2.5 flex-1 rounded-full bg-slate-100">
                <div className={`h-2.5 rounded-full ${band.barClass}`} style={{ width: `${widthPct}%` }} />
              </div>
              <span className="w-6 shrink-0 text-right text-xs tabular-nums text-slate-500">{value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
