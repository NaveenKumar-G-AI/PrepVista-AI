import type { Goal } from "../types";

const HEALTH_STYLE: Record<Goal["health"], { color: string; bg: string; label: string }> = {
  HEALTHY: { color: "var(--accent-current)", bg: "var(--accent-current-soft)", label: "Healthy" },
  IMPROVING: { color: "var(--accent-current)", bg: "var(--accent-current-soft)", label: "Improving" },
  NEEDS_ATTENTION: { color: "var(--accent-summit)", bg: "var(--accent-summit-soft)", label: "Needs attention" },
  AT_RISK: { color: "var(--accent-risk)", bg: "var(--accent-risk-soft)", label: "At risk" },
  PAUSED: { color: "var(--ink-muted)", bg: "var(--bg-surface-raised)", label: "Paused" },
  COMPLETED: { color: "var(--accent-summit)", bg: "var(--accent-summit-soft)", label: "Completed" },
};

export function GoalHealthBadge({ health }: { health: Goal["health"] }) {
  const style = HEALTH_STYLE[health];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "4px 11px",
        borderRadius: 999,
        fontSize: 12.5,
        fontWeight: 600,
        color: style.color,
        background: style.bg,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 3, background: style.color }} />
      {style.label}
    </span>
  );
}
