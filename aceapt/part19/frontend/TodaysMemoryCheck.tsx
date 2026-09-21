// ============================================================================
// TodaysMemoryCheck
//
// Matches the brief's mockup:
//
//   Today's Memory Check
//   2 concepts require recall.
//   Estimated time: 3 minutes.
//   [ Start ]
//
// Assumes Tailwind is available in the host app (ACEAPT's actual design
// system may use different tokens — restyle freely, the fetch/state logic
// is the part worth keeping as-is). No external dependencies beyond React.
// ============================================================================

import { useEffect, useState } from 'react';

export interface ReviewPlanItem {
  conceptId: string;
  priorityScore: number;
  reason: string;
}

export interface ReviewPlan {
  studentId: string;
  generatedAt: string;
  items: ReviewPlanItem[];
  estimatedMinutes: number;
}

export interface TodaysMemoryCheckProps {
  studentId: string;
  apiBaseUrl?: string;
  /** Called when the student taps Start. Receives the plan so the host app can launch the right session type. */
  onStart?: (plan: ReviewPlan) => void;
}

export default function TodaysMemoryCheck({ studentId, apiBaseUrl = '/api/feature19', onStart }: TodaysMemoryCheckProps) {
  const [plan, setPlan] = useState<ReviewPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`${apiBaseUrl}/students/${encodeURIComponent(studentId)}/today-memory-check`)
      .then(res => {
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return res.json() as Promise<ReviewPlan>;
      })
      .then(data => {
        if (!cancelled) setPlan(data);
      })
      .catch(err => {
        if (!cancelled) setError(err.message ?? 'Could not load your memory check.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [studentId, apiBaseUrl]);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 animate-pulse">
        <div className="h-4 w-40 rounded bg-slate-200 mb-3" />
        <div className="h-3 w-56 rounded bg-slate-100 mb-2" />
        <div className="h-3 w-32 rounded bg-slate-100" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
        Couldn't load today's memory check. {error}
      </div>
    );
  }

  const count = plan?.items.length ?? 0;

  if (count === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="text-base font-semibold text-slate-900">Today's Memory Check</h3>
        <p className="mt-1 text-sm text-slate-500">Nothing needs a recall check right now — you're caught up.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <h3 className="text-base font-semibold text-slate-900">Today's Memory Check</h3>
      <p className="mt-1 text-sm text-slate-600">
        {count} {count === 1 ? 'concept requires' : 'concepts require'} recall.
      </p>
      <p className="text-sm text-slate-500">Estimated time: {plan!.estimatedMinutes} minute{plan!.estimatedMinutes === 1 ? '' : 's'}.</p>
      <button
        type="button"
        onClick={() => onStart?.(plan!)}
        className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
      >
        Start
      </button>
    </div>
  );
}
