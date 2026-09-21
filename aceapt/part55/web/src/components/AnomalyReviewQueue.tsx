import { useState } from 'react';
import type { Anomaly } from '../lib/api.js';

const TYPE_LABEL: Record<string, string> = {
  TOO_EASY: 'Too easy',
  TOO_HARD: 'Too hard',
  UNEXPECTEDLY_SLOW: 'Unexpectedly slow',
  UNEXPECTEDLY_FAST: 'Unexpectedly fast',
  HIGH_VARIANCE: 'High variance',
  LABEL_MISMATCH: 'Label mismatch',
  DIFFICULTY_DRIFT: 'Difficulty drift',
  WEAK_DISCRIMINATION: 'Weak discrimination',
};

const SEVERITY_COLOR: Record<string, string> = {
  LOW: '#5B655D',
  MEDIUM: '#A67C1E',
  HIGH: '#9C4A3C',
};

/**
 * §124: the review queue. Every action here is append-only on the backend
 * (a review_actions row plus an anomaly status change) — nothing lets an
 * admin edit the underlying evidence directly (§122).
 */
export function AnomalyReviewQueue({
  anomalies,
  onReview,
}: {
  anomalies: Anomaly[];
  onReview: (anomalyId: string, questionVersionId: string, action: string) => void;
}) {
  const [pending, setPending] = useState<string | null>(null);

  async function act(a: Anomaly, action: string) {
    setPending(a.id);
    try {
      await onReview(a.id, a.question_version_id, action);
    } finally {
      setPending(null);
    }
  }

  if (anomalies.length === 0) {
    return (
      <div className="rounded border border-grid bg-panel px-5 py-8 text-center text-sm text-ink-soft">
        Nothing needs review right now.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded border border-grid bg-panel">
      <div className="border-b border-grid px-5 py-4">
        <h2 className="font-display text-lg text-ink">Anomaly review</h2>
      </div>
      <ul className="divide-y divide-grid">
        {anomalies.map((a) => (
          <li key={a.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: SEVERITY_COLOR[a.severity] }}
                  aria-hidden
                />
                <span className="font-display text-sm text-ink">{TYPE_LABEL[a.type] ?? a.type}</span>
                <span className="font-mono text-[11px] text-ink-soft">{a.question_version_id.slice(0, 8)}</span>
              </div>
              {typeof a.details?.note === 'string' && (
                <p className="mt-1 max-w-xl text-xs text-ink-soft">{a.details.note}</p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                disabled={pending === a.id}
                onClick={() => act(a, 'APPROVE')}
                className="rounded border border-verdigris px-2.5 py-1 text-xs text-verdigris hover:bg-verdigris hover:text-white disabled:opacity-50"
              >
                Approve
              </button>
              <button
                disabled={pending === a.id}
                onClick={() => act(a, 'REQUEST_RECALIBRATION')}
                className="rounded border border-brass px-2.5 py-1 text-xs text-brass hover:bg-brass hover:text-white disabled:opacity-50"
              >
                Recalibrate
              </button>
              <button
                disabled={pending === a.id}
                onClick={() => act(a, 'DISMISS')}
                className="rounded border border-grid px-2.5 py-1 text-xs text-ink-soft hover:bg-paper disabled:opacity-50"
              >
                Dismiss
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
