import React from 'react';
import { SpeedHistoryPoint } from '../types/speed';

export interface SpeedHistoryProps {
  points: SpeedHistoryPoint[];
}

/** Spec 66, 71: time is never shown without its accuracy context. Renders a
 * small inline sparkline with no external chart dependency, so this module
 * stays a drop-in with react/react-dom as its only peer deps. */
export function SpeedHistory({ points }: SpeedHistoryProps) {
  if (points.length === 0) {
    return <p className="text-sm text-slate-400">Not enough sessions yet to show a trend.</p>;
  }

  const width = 280;
  const height = 64;
  const maxSec = Math.max(...points.map((p) => p.avgSec));
  const minSec = Math.min(...points.map((p) => p.avgSec));
  const range = Math.max(1, maxSec - minSec);
  const stepX = points.length > 1 ? width / (points.length - 1) : 0;

  const path = points
    .map((p, i) => {
      const x = i * stepX;
      const y = height - ((p.avgSec - minSec) / range) * (height - 8) - 4;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Speed trend</p>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 w-full" role="img" aria-label="Average response time trend across recent sessions">
        <path d={path} fill="none" stroke="#0f766e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        {points.map((p) => (
          <div key={p.label} className="flex flex-col">
            <dt className="text-xs text-slate-400">{p.label}</dt>
            <dd className="font-mono tabular-nums text-slate-800">
              {p.avgSec}s <span className="text-xs text-slate-400">· {Math.round(p.accuracy * 100)}%</span>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default SpeedHistory;
