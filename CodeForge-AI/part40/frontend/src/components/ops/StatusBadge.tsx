import React from "react";

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  // Alerts / generic
  OPEN: { bg: "var(--ops-open-bg, #3a2414)", fg: "var(--ops-open-fg, #ffb066)" },
  ACKNOWLEDGED: { bg: "var(--ops-ack-bg, #1e2b3a)", fg: "var(--ops-ack-fg, #9fb8d1)" },
  RESOLVED: { bg: "var(--ops-resolved-bg, #14351f)", fg: "var(--ops-resolved-fg, #7fd99a)" },
  // Incidents
  INVESTIGATING: { bg: "var(--ops-investigating-bg, #3a2414)", fg: "var(--ops-investigating-fg, #ffb066)" },
  MITIGATING: { bg: "var(--ops-mitigating-bg, #3a1414)", fg: "var(--ops-mitigating-fg, #ff8a8a)" },
  MONITORING: { bg: "var(--ops-monitoring-bg, #1e2b3a)", fg: "var(--ops-monitoring-fg, #9fb8d1)" },
  // Service health
  HEALTHY: { bg: "var(--ops-healthy-bg, #14351f)", fg: "var(--ops-healthy-fg, #7fd99a)" },
  DEGRADED: { bg: "var(--ops-degraded-bg, #3a2414)", fg: "var(--ops-degraded-fg, #ffb066)" },
  UNAVAILABLE: { bg: "var(--ops-unavailable-bg, #3a1414)", fg: "var(--ops-unavailable-fg, #ff8a8a)" },
  // Sessions
  ACTIVE: { bg: "var(--ops-healthy-bg, #14351f)", fg: "var(--ops-healthy-fg, #7fd99a)" },
  EXPIRED: { bg: "var(--ops-ack-bg, #1e2b3a)", fg: "var(--ops-ack-fg, #9fb8d1)" },
  REVOKED: { bg: "var(--ops-unavailable-bg, #3a1414)", fg: "var(--ops-unavailable-fg, #ff8a8a)" },
  SUSPENDED: { bg: "var(--ops-degraded-bg, #3a2414)", fg: "var(--ops-degraded-fg, #ffb066)" }
};

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLE[status] ?? { bg: "var(--ops-info-bg, #1e2b3a)", fg: "var(--ops-info-fg, #9fb8d1)" };
  const label = status.charAt(0) + status.slice(1).toLowerCase();
  return (
    <span className="ops-badge" style={{ backgroundColor: style.bg, color: style.fg }} role="status" aria-label={`Status: ${label}`}>
      {label}
    </span>
  );
}
