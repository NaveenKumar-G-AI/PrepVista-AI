import React from "react";

const SEVERITY_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  CRITICAL: { bg: "var(--ops-critical-bg, #4a1414)", fg: "var(--ops-critical-fg, #ff8a8a)", label: "Critical" },
  HIGH: { bg: "var(--ops-high-bg, #4a2a14)", fg: "var(--ops-high-fg, #ffb066)", label: "High" },
  MEDIUM: { bg: "var(--ops-medium-bg, #4a4414)", fg: "var(--ops-medium-fg, #f0d666)", label: "Medium" },
  LOW: { bg: "var(--ops-low-bg, #143a4a)", fg: "var(--ops-low-fg, #74c7ec)", label: "Low" },
  INFO: { bg: "var(--ops-info-bg, #1e2b3a)", fg: "var(--ops-info-fg, #9fb8d1)", label: "Info" }
};

export function SeverityBadge({ severity }: { severity: string }) {
  const style = SEVERITY_STYLE[severity] ?? SEVERITY_STYLE.INFO!;
  return (
    <span
      className="ops-badge"
      style={{ backgroundColor: style.bg, color: style.fg }}
      role="status"
      aria-label={`Severity: ${style.label}`}
    >
      {style.label}
    </span>
  );
}
