import type { GapSize } from "../types";

const LABELS: Record<string, string> = {
  quant: "Quant",
  logical: "Logical",
  verbal: "Verbal",
  probability: "Probability",
  data_interpretation: "Data Interp.",
};

const GAUGE_HEIGHT = 132;
const GAUGE_WIDTH = 34;

function scaleY(value: number): number {
  const clamped = Math.max(0, Math.min(100, value));
  return GAUGE_HEIGHT - (clamped / 100) * GAUGE_HEIGHT;
}

function Gauge({ item }: { item: GapSize }) {
  const label = LABELS[item.dimension] ?? item.dimension;
  const hasCurrent = item.current !== null;
  const hasTarget = item.target !== null;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, width: 76 }}>
      <svg width={GAUGE_WIDTH} height={GAUGE_HEIGHT + 4} style={{ overflow: "visible" }}>
        {/* the tube */}
        <rect
          x={0}
          y={0}
          width={GAUGE_WIDTH}
          height={GAUGE_HEIGHT}
          rx={GAUGE_WIDTH / 2}
          fill="var(--bg-surface-raised)"
          stroke="var(--border-subtle)"
        />
        {/* current fill (the climb so far) */}
        {hasCurrent && (
          <rect
            x={0}
            y={scaleY(item.current!)}
            width={GAUGE_WIDTH}
            height={GAUGE_HEIGHT - scaleY(item.current!)}
            rx={GAUGE_WIDTH / 2}
            fill="var(--accent-current)"
            opacity={0.85}
          />
        )}
        {/* target line (the summit marker) */}
        {hasTarget && (
          <g>
            <line
              x1={-6}
              x2={GAUGE_WIDTH + 6}
              y1={scaleY(item.target!)}
              y2={scaleY(item.target!)}
              stroke="var(--accent-summit)"
              strokeWidth={2.5}
              strokeDasharray="3 3"
            />
            <circle cx={GAUGE_WIDTH + 6} cy={scaleY(item.target!)} r={2.5} fill="var(--accent-summit)" />
          </g>
        )}
      </svg>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 12, color: "var(--ink-muted)", marginBottom: 2 }}>{label}</div>
        <div className="font-mono" style={{ fontSize: 13, color: "var(--ink-primary)" }}>
          {hasCurrent ? Math.round(item.current!) : "\u2014"}
          <span style={{ color: "var(--ink-faint)" }}> / </span>
          {hasTarget ? Math.round(item.target!) : "\u2014"}
        </div>
        {item.gap !== null && item.gap > 0 && (
          <div className="font-mono" style={{ fontSize: 11, color: "var(--accent-risk)", marginTop: 1 }}>
            {"\u2212"}
            {Math.round(item.gap)}
          </div>
        )}
        {item.gap === 0 && (
          <div className="font-mono" style={{ fontSize: 11, color: "var(--accent-current)", marginTop: 1 }}>
            met
          </div>
        )}
      </div>
    </div>
  );
}

export function GoalGapMap({ capability }: { capability: GapSize[] }) {
  const known = capability.filter((c) => c.current !== null || c.target !== null);
  if (known.length === 0) {
    return <p style={{ color: "var(--ink-muted)" }}>Not enough data yet to map the gap.</p>;
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", padding: "4px 0" }}>
        {known.map((item) => (
          <Gauge key={item.dimension} item={item} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 18, fontSize: 12, color: "var(--ink-muted)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 10, height: 10, borderRadius: 5, background: "var(--accent-current)", display: "inline-block" }} />
          Current
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 12, height: 2, background: "var(--accent-summit)", display: "inline-block" }} />
          Target
        </span>
      </div>
    </div>
  );
}
