import React from 'react';
import { AlignmentSnapshot } from '../../types/align.types';

const WIDTH = 560;
const HEIGHT = 180;
const PAD_X = 36;
const PAD_Y = 20;

function buildPath(values: (number | null)[]): string {
  const points = values
    .map((v, i) => (v === null ? null : { x: i, y: v }))
    .filter((p): p is { x: number; y: number } => p !== null);
  if (points.length === 0) return '';

  const stepX = (WIDTH - PAD_X * 2) / Math.max(1, values.length - 1);
  return points
    .map((p, idx) => {
      const x = PAD_X + p.x * stepX;
      const y = PAD_Y + (1 - p.y / 100) * (HEIGHT - PAD_Y * 2);
      return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

export function AlignmentHistoryChart({ snapshots }: { snapshots: AlignmentSnapshot[] }) {
  if (snapshots.length === 0) {
    return (
      <p className="font-body text-sm text-align-text-tertiary">
        No history yet — this builds up as alignment is recalculated over time.
      </p>
    );
  }

  const fitValues = snapshots.map((s) => s.fitScore);
  const readinessValues = snapshots.map((s) => s.readinessScore);

  return (
    <div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-labelledby="history-title" className="w-full">
        <title id="history-title">Fit and readiness over time</title>
        {[0, 25, 50, 75, 100].map((mark) => {
          const y = PAD_Y + (1 - mark / 100) * (HEIGHT - PAD_Y * 2);
          return (
            <g key={mark}>
              <line x1={PAD_X} y1={y} x2={WIDTH - PAD_X} y2={y} stroke="var(--align-border)" strokeWidth={1} />
              <text x={PAD_X - 8} y={y + 3} textAnchor="end" className="fill-align-text-tertiary font-mono text-[9px]">
                {mark}
              </text>
            </g>
          );
        })}

        <path d={buildPath(fitValues)} fill="none" stroke="var(--align-fit)" strokeWidth={2} />
        <path d={buildPath(readinessValues)} fill="none" stroke="var(--align-readiness)" strokeWidth={2} />

        {snapshots.length === 1 && (
          <>
            {fitValues[0] !== null && (
              <circle cx={PAD_X} cy={PAD_Y + (1 - fitValues[0]! / 100) * (HEIGHT - PAD_Y * 2)} r={3.5} fill="var(--align-fit)" />
            )}
            {readinessValues[0] !== null && (
              <circle
                cx={PAD_X}
                cy={PAD_Y + (1 - readinessValues[0]! / 100) * (HEIGHT - PAD_Y * 2)}
                r={3.5}
                fill="var(--align-readiness)"
              />
            )}
          </>
        )}
      </svg>

      <div className="mt-2 flex gap-4 font-body text-xs text-align-text-secondary">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-align-fit" aria-hidden="true" /> Fit
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-align-readiness" aria-hidden="true" /> Readiness
        </span>
      </div>
    </div>
  );
}
