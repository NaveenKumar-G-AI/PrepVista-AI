import React from 'react';
import { AlignmentState } from '../../types/align.types';

export interface ScopePoint {
  targetId: string;
  targetName: string;
  fitScore: number;
  readinessScore: number;
  state: AlignmentState;
}

const STATE_DOT_COLOR: Record<AlignmentState, string> = {
  STRONGLY_ALIGNED: 'var(--align-readiness)',
  DEVELOPING_ALIGNMENT: 'var(--align-caution)',
  LOW_ALIGNMENT: 'var(--align-critical)',
  INSUFFICIENT_EVIDENCE: 'var(--align-text-tertiary)',
};

const PAD = 44;
const SIZE = 400;
const PLOT = SIZE - PAD * 2;

function toX(fit: number): number {
  return PAD + (fit / 100) * PLOT;
}
function toY(readiness: number): number {
  return PAD + (1 - readiness / 100) * PLOT;
}

/**
 * spec §35: "an intuitive four-quadrant model... polished and accessible."
 * The rings are decorative (the calibration-instrument motif carried
 * through the rest of ALIGN's visual language) — the actual data is a
 * plain Cartesian fit-by-readiness plot, exactly as the spec's own ASCII
 * diagram describes, not a polar/radar encoding.
 */
export function FitReadinessScope({
  points,
  highlightedTargetId,
}: {
  points: ScopePoint[];
  highlightedTargetId?: string;
}) {
  const center = SIZE / 2;
  const maxRadius = PLOT / 2;

  return (
    <div className="align-rise-in">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-labelledby="scope-title scope-desc"
        className="w-full max-w-[420px]"
      >
        <title id="scope-title">Fit versus readiness, by target</title>
        <desc id="scope-desc">
          {points
            .map((p) => `${p.targetName}: fit ${p.fitScore} percent, readiness ${p.readinessScore} percent`)
            .join('. ')}
        </desc>

        {/* decorative calibration rings */}
        {[1, 0.66, 0.33].map((f) => (
          <circle
            key={f}
            cx={center}
            cy={center}
            r={maxRadius * f}
            fill="none"
            stroke="var(--align-border)"
            strokeWidth={1}
          />
        ))}
        <g className="align-scope-sweep" style={{ transformBox: 'fill-box' }}>
          <line x1={center} y1={center} x2={center} y2={PAD} stroke="var(--align-fit-dim)" strokeWidth={1} opacity={0.5} />
        </g>

        {/* quadrant crosshair at the 50/50 midline */}
        <line x1={PAD} y1={center} x2={SIZE - PAD} y2={center} stroke="var(--align-border-strong)" strokeWidth={1} />
        <line x1={center} y1={PAD} x2={center} y2={SIZE - PAD} stroke="var(--align-border-strong)" strokeWidth={1} />

        {/* axis labels */}
        <text x={SIZE - PAD} y={center + 16} textAnchor="end" className="fill-align-text-tertiary font-body text-[10px] uppercase tracking-wider">
          High Fit
        </text>
        <text x={PAD} y={center + 16} textAnchor="start" className="fill-align-text-tertiary font-body text-[10px] uppercase tracking-wider">
          Low Fit
        </text>
        <text x={center} y={PAD - 12} textAnchor="middle" className="fill-align-text-tertiary font-body text-[10px] uppercase tracking-wider">
          High Readiness
        </text>
        <text x={center} y={SIZE - PAD + 20} textAnchor="middle" className="fill-align-text-tertiary font-body text-[10px] uppercase tracking-wider">
          Low Readiness
        </text>

        {/* quadrant hints */}
        <text x={SIZE - PAD - 6} y={PAD + 16} textAnchor="end" className="fill-align-text-tertiary font-body text-[10px] italic">
          Best target
        </text>
        <text x={SIZE - PAD - 6} y={SIZE - PAD - 10} textAnchor="end" className="fill-align-text-tertiary font-body text-[10px] italic">
          Strong potential
        </text>
        <text x={PAD + 6} y={PAD + 16} textAnchor="start" className="fill-align-text-tertiary font-body text-[10px] italic">
          Ready, lower fit
        </text>

        {points.map((p) => {
          const isHighlighted = p.targetId === highlightedTargetId;
          const x = toX(p.fitScore);
          const y = toY(p.readinessScore);
          return (
            <g key={p.targetId}>
              {isHighlighted && (
                <circle cx={x} cy={y} r={12} fill="none" stroke={STATE_DOT_COLOR[p.state]} strokeWidth={1.5} opacity={0.5} />
              )}
              <circle cx={x} cy={y} r={isHighlighted ? 6 : 4.5} fill={STATE_DOT_COLOR[p.state]}>
                {!isHighlighted && <title>{`${p.targetName}: fit ${p.fitScore}%, readiness ${p.readinessScore}%`}</title>}
              </circle>
              {isHighlighted && (
                <text
                  x={x}
                  y={y - 18}
                  textAnchor="middle"
                  className="font-body text-[12px] font-medium fill-align-text-primary"
                >
                  {p.targetName}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {/* legend for the non-highlighted points, since only the highlighted one gets a persistent on-scope label (dense clusters would otherwise overlap illegibly) */}
      {points.some((p) => p.targetId !== highlightedTargetId) && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {points
            .filter((p) => p.targetId !== highlightedTargetId)
            .map((p) => (
              <li key={p.targetId} className="flex items-center gap-1.5 font-body text-xs text-align-text-secondary">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: STATE_DOT_COLOR[p.state] }} aria-hidden="true" />
                {p.targetName}
              </li>
            ))}
        </ul>
      )}

      {/* accessible data table equivalent — visually hidden, screen-reader only */}
      <table className="sr-only">
        <caption>Fit and readiness by target</caption>
        <thead>
          <tr>
            <th>Target</th>
            <th>Fit</th>
            <th>Readiness</th>
            <th>State</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.targetId}>
              <td>{p.targetName}</td>
              <td>{p.fitScore}%</td>
              <td>{p.readinessScore}%</td>
              <td>{p.state.replaceAll('_', ' ').toLowerCase()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
