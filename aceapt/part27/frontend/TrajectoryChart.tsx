import React from "react";
import type { ForecastRange } from "./types.js";

export interface TrajectoryPoint {
  date: string;
  value: number;
}

export interface TrajectoryChartProps {
  history: TrajectoryPoint[];
  target?: number | null;
  projectedRange?: ForecastRange | null;
  /** Days from the last history point to the target/horizon date, used to
   * place the projected segment. Omit (or 0) to skip drawing a projection. */
  daysRemaining?: number | null;
}

const WIDTH = 640;
const HEIGHT = 220;
const MARGIN = { top: 18, right: 16, bottom: 26, left: 16 };

export function TrajectoryChart({ history, target, projectedRange, daysRemaining }: TrajectoryChartProps) {
  const sorted = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (sorted.length < 2) {
    return (
      <div className="af-panel">
        <p className="af-panel__title">Trajectory</p>
        <p className="af-empty">Not enough history yet to plot a trajectory.</p>
      </div>
    );
  }

  const lastPoint = sorted[sorted.length - 1]!;
  const lastTime = new Date(lastPoint.date).getTime();
  const firstTime = new Date(sorted[0]!.date).getTime();
  const hasProjection = !!(projectedRange && daysRemaining != null && daysRemaining > 0);
  const projectedTime = hasProjection ? lastTime + (daysRemaining as number) * 86_400_000 : lastTime;
  const maxTime = Math.max(projectedTime, lastTime);

  const values = sorted.map((p) => p.value);
  if (target != null) values.push(target);
  if (projectedRange) values.push(projectedRange.low, projectedRange.high);
  const domainMin = Math.max(0, Math.min(...values) - 6);
  const domainMax = Math.min(100, Math.max(...values) + 6);

  const innerW = WIDTH - MARGIN.left - MARGIN.right;
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;

  const x = (t: number) => MARGIN.left + (maxTime === firstTime ? 0 : ((t - firstTime) / (maxTime - firstTime)) * innerW);
  const y = (v: number) => MARGIN.top + innerH - ((v - domainMin) / (domainMax - domainMin || 1)) * innerH;

  const actualPath = sorted.map((p, i) => `${i === 0 ? "M" : "L"} ${x(new Date(p.date).getTime())} ${y(p.value)}`).join(" ");
  const projX = x(projectedTime);
  const midProjected = projectedRange ? (projectedRange.low + projectedRange.high) / 2 : lastPoint.value;

  return (
    <div className="af-panel">
      <p className="af-panel__title">Trajectory</p>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        height={HEIGHT}
        role="img"
        aria-label="Readiness trajectory over time, with a projected range toward the target"
      >
        {target != null && (
          <>
            <line
              x1={MARGIN.left}
              y1={y(target)}
              x2={WIDTH - MARGIN.right}
              y2={y(target)}
              stroke="var(--af-ink-faint)"
              strokeDasharray="3 4"
              strokeWidth={1.5}
            />
            <text x={WIDTH - MARGIN.right} y={y(target) - 6} fontSize={11} fontWeight={600} fill="var(--af-ink-muted)" textAnchor="end">
              Target {Math.round(target)}%
            </text>
          </>
        )}

        {hasProjection && projectedRange && (
          <polygon
            points={`${x(lastTime)},${y(lastPoint.value)} ${projX},${y(projectedRange.high)} ${projX},${y(projectedRange.low)}`}
            fill="var(--af-brand)"
            opacity={0.14}
          />
        )}

        <path d={actualPath} fill="none" stroke="var(--af-brand)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

        {hasProjection && (
          <line
            x1={x(lastTime)}
            y1={y(lastPoint.value)}
            x2={projX}
            y2={y(midProjected)}
            stroke="var(--af-brand)"
            strokeWidth={2}
            strokeDasharray="5 5"
          />
        )}

        {sorted.slice(0, -1).map((p) => (
          <circle
            key={p.date}
            cx={x(new Date(p.date).getTime())}
            cy={y(p.value)}
            r={3.5}
            fill="var(--af-surface)"
            stroke="var(--af-brand)"
            strokeWidth={2}
          >
            <title>{`${new Date(p.date).toLocaleDateString()}: ${Math.round(p.value)}%`}</title>
          </circle>
        ))}
        <circle cx={x(lastTime)} cy={y(lastPoint.value)} r={5} fill="var(--af-brand)" stroke="var(--af-surface)" strokeWidth={2}>
          <title>{`Now: ${Math.round(lastPoint.value)}%`}</title>
        </circle>

        <text x={MARGIN.left} y={HEIGHT - 6} fontSize={10.5} fill="var(--af-ink-faint)">
          {new Date(firstTime).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </text>
        <text x={WIDTH - MARGIN.right} y={HEIGHT - 6} fontSize={10.5} fill="var(--af-ink-faint)" textAnchor="end">
          {hasProjection ? "Projected" : new Date(lastTime).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
        </text>
      </svg>
      <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--af-ink-muted)", marginTop: 4 }}>
        <span>
          <svg width="16" height="8" style={{ verticalAlign: "middle", marginRight: 4 }}>
            <line x1="0" y1="4" x2="16" y2="4" stroke="var(--af-brand)" strokeWidth="2.5" />
          </svg>
          Actual
        </span>
        {hasProjection && (
          <span>
            <svg width="16" height="8" style={{ verticalAlign: "middle", marginRight: 4 }}>
              <line x1="0" y1="4" x2="16" y2="4" stroke="var(--af-brand)" strokeWidth="2" strokeDasharray="4 3" />
            </svg>
            Projected
          </span>
        )}
      </div>
    </div>
  );
}
