import React from "react";
import type { ForecastRange, ForecastResult, ReadinessState } from "./types.js";

const STATUS_META: Record<ReadinessState, { label: string; badgeClass: string }> = {
  NOT_ENOUGH_EVIDENCE: { label: "Not enough evidence", badgeClass: "af-badge--neutral" },
  DEVELOPING: { label: "Developing", badgeClass: "af-badge--neutral" },
  AT_RISK: { label: "At risk", badgeClass: "af-badge--risk" },
  IMPROVING: { label: "Improving", badgeClass: "af-badge--good" },
  ON_TRACK: { label: "On track", badgeClass: "af-badge--good" },
  TARGET_REACHED: { label: "Target reached", badgeClass: "af-badge--good" },
  STABLE: { label: "Stable", badgeClass: "af-badge--neutral" },
};

function scale(value: number, domainMin: number, domainMax: number, rangeMin: number, rangeMax: number): number {
  if (domainMax === domainMin) return (rangeMin + rangeMax) / 2;
  const t = (value - domainMin) / (domainMax - domainMin);
  return rangeMin + t * (rangeMax - rangeMin);
}

/** A compact, custom "runway" visual: where you are, the projected
 * uncertainty band, and the target — all on one value axis. Deliberately not
 * a circular "confidence meter" or a full time-series chart (spec section 44
 * rules those out here); see TrajectoryChart for the full history view. */
function TrajectorySpine({ current, target, range }: { current: number; target: number; range: ForecastRange | null }) {
  const width = 600;
  const height = 56;
  const margin = 14;
  const values = [current, target, range?.low ?? current, range?.high ?? current];
  const domainMin = Math.max(0, Math.min(...values) - 8);
  const domainMax = Math.min(100, Math.max(...values) + 8);
  const x = (v: number) => scale(v, domainMin, domainMax, margin, width - margin);
  const y = height / 2;

  return (
    <svg
      className="af-hero__spine"
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      role="img"
      aria-label={`Current readiness ${Math.round(current)}%, target ${Math.round(target)}%${range ? `, projected range ${Math.round(range.low)} to ${Math.round(range.high)} percent` : ""}`}
    >
      <line x1={margin} y1={y} x2={width - margin} y2={y} stroke="var(--af-border-strong)" strokeWidth={2} />
      {range && (
        <rect
          x={Math.min(x(range.low), x(range.high))}
          y={y - 7}
          width={Math.max(Math.abs(x(range.high) - x(range.low)), 2)}
          height={14}
          rx={7}
          fill="var(--af-brand)"
          opacity={0.16}
        />
      )}
      <line x1={x(target)} y1={y - 16} x2={x(target)} y2={y + 16} stroke="var(--af-ink)" strokeWidth={2} />
      <text x={x(target)} y={y - 22} fontSize={10.5} fontWeight={700} fill="var(--af-ink-muted)" textAnchor="middle">
        TARGET
      </text>
      <circle cx={x(current)} cy={y} r={6} fill="var(--af-brand)" stroke="var(--af-surface)" strokeWidth={2} />
      <text x={x(current)} y={y + 24} fontSize={10.5} fontWeight={700} fill="var(--af-brand)" textAnchor="middle">
        NOW
      </text>
    </svg>
  );
}

export interface ReadinessCardProps {
  currentOverall: number;
  status: ReadinessState;
  forecast: ForecastResult | null;
  mainRiskLabel: string | null;
  onWhy?: () => void;
  onFixReadiness?: () => void;
  fixReadinessLoading?: boolean;
}

export function ReadinessCard({
  currentOverall,
  status,
  forecast,
  mainRiskLabel,
  onWhy,
  onFixReadiness,
  fixReadinessLoading,
}: ReadinessCardProps) {
  const meta = STATUS_META[status];
  const target = forecast?.target ?? null;
  const gap = target != null ? Math.max(0, Math.round(target - currentOverall)) : null;

  return (
    <section className="af-hero">
      <div className="af-hero__top">
        <p className="af-hero__title">Your readiness</p>
        <span className={`af-badge ${meta.badgeClass}`}>{meta.label}</span>
      </div>

      <div className="af-hero__number-row">
        <span className="af-hero__number">{Math.round(currentOverall)}%</span>
      </div>

      {target != null && (
        <div className="af-hero__meta">
          <span>
            Target <strong>{Math.round(target)}%</strong>
          </span>
          {gap != null && gap > 0 && (
            <span>
              Gap <strong>{gap} pts</strong>
            </span>
          )}
          {forecast && (
            <span>
              Confidence <strong>{forecast.confidence.level}</strong>
            </span>
          )}
        </div>
      )}

      {target != null && <TrajectorySpine current={currentOverall} target={target} range={forecast?.projectedRange ?? null} />}

      {mainRiskLabel && (
        <p className="af-hero__risk">
          Main risk: <strong>{mainRiskLabel}</strong>
        </p>
      )}

      {(onWhy || onFixReadiness) && (
        <div className="af-hero__actions">
          {onWhy && (
            <button type="button" className="af-btn" onClick={onWhy}>
              Why?
            </button>
          )}
          {onFixReadiness && (
            <button type="button" className="af-btn af-btn--primary" onClick={onFixReadiness} disabled={fixReadinessLoading}>
              {fixReadinessLoading ? "Generating plan…" : "Fix my readiness"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
