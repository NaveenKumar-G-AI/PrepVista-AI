import React from 'react';
import { SessionSummary } from '../types/speed';

export interface SpeedSummaryProps {
  summary: SessionSummary;
  onContinue?: () => void;
}

/** Spec 93, 118: leads with the headline achievement, always shows time
 * alongside accuracy, and names one caution honestly rather than only
 * celebrating. */
export function SpeedSummary({ summary, onContinue }: SpeedSummaryProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Session complete</p>
      <h2 className="mt-1 text-xl font-semibold text-slate-900">{summary.headline}</h2>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Time before" value={`${summary.time.beforeSec}s`} />
        <Stat label="Time after" value={`${summary.time.afterSec}s`} accent />
        <Stat label="Accuracy before" value={`${Math.round(summary.accuracy.before * 100)}%`} />
        <Stat label="Accuracy after" value={`${Math.round(summary.accuracy.after * 100)}%`} accent />
      </div>

      <div className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-sm">
        <p>
          <span className="font-medium text-slate-700">Main improvement:</span> <span className="text-slate-600">{summary.mainImprovement}</span>
        </p>
        {summary.mainCaution && (
          <p>
            <span className="font-medium text-amber-700">Worth noting:</span> <span className="text-slate-600">{summary.mainCaution}</span>
          </p>
        )}
        <p>
          <span className="font-medium text-slate-700">Next focus:</span> <span className="text-slate-600">{summary.nextFocus}</span>
        </p>
      </div>

      {onContinue && (
        <button
          type="button"
          onClick={onContinue}
          className="mt-5 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
        >
          Continue
        </button>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className={`font-mono text-lg tabular-nums ${accent ? 'text-emerald-700' : 'text-slate-800'}`}>{value}</p>
    </div>
  );
}

export default SpeedSummary;
