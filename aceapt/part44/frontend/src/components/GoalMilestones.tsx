import type { GoalMilestone } from "../types";

function MarkerIcon({ status }: { status: GoalMilestone["status"] }) {
  if (status === "ACHIEVED") {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="9" fill="var(--accent-summit)" />
        <path d="M6 10.5l2.5 2.5L14 7.5" stroke="var(--bg-void)" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (status === "ACTIVE") {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20">
        <circle cx="10" cy="10" r="8.5" fill="var(--bg-void)" stroke="var(--accent-current)" strokeWidth="2" />
        <circle cx="10" cy="10" r="3.5" fill="var(--accent-current)" />
      </svg>
    );
  }
  return (
    <svg width="20" height="20" viewBox="0 0 20 20">
      <circle cx="10" cy="10" r="8.5" fill="var(--bg-surface)" stroke="var(--border-strong)" strokeWidth="1.5" />
    </svg>
  );
}

export function GoalMilestones({ milestones }: { milestones: GoalMilestone[] }) {
  const sorted = [...milestones].sort((a, b) => a.sequence - b.sequence);

  return (
    <div style={{ position: "relative", paddingLeft: 4 }}>
      <div
        style={{
          position: "absolute",
          left: 13,
          top: 10,
          bottom: 10,
          width: 1,
          background: "repeating-linear-gradient(to bottom, var(--border-strong) 0, var(--border-strong) 4px, transparent 4px, transparent 9px)",
        }}
      />
      {sorted.map((m) => (
        <div key={m.id} style={{ display: "flex", gap: 14, position: "relative", paddingBottom: 22 }}>
          <div style={{ flexShrink: 0, zIndex: 1, background: "var(--bg-surface)", borderRadius: "50%" }}>
            <MarkerIcon status={m.status} />
          </div>
          <div style={{ paddingTop: 1 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: m.status === "UPCOMING" ? "var(--ink-muted)" : "var(--ink-primary)",
              }}
            >
              {m.title}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ink-muted)", marginTop: 2, maxWidth: 420 }}>{m.evidenceRequired}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
