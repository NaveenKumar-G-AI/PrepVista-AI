import type { FC } from "react";

export type Health = "STRONG" | "HEALTHY" | "NEUTRAL" | "COOLING" | "AT_RISK" | "INACTIVE";

const HEALTH_META: Record<Health, { label: string; dot: string; text: string; bg: string }> = {
  STRONG: { label: "Strong", dot: "bg-signal-strong", text: "text-signal-strong", bg: "bg-signal-strong/10" },
  HEALTHY: { label: "Healthy", dot: "bg-signal-healthy", text: "text-signal-healthy", bg: "bg-signal-healthy/10" },
  NEUTRAL: { label: "Neutral", dot: "bg-signal-neutral", text: "text-ink-soft", bg: "bg-signal-neutral/10" },
  COOLING: { label: "Cooling", dot: "bg-signal-cooling", text: "text-signal-cooling", bg: "bg-signal-cooling/10" },
  AT_RISK: { label: "At risk", dot: "bg-signal-risk", text: "text-signal-risk", bg: "bg-signal-risk/10" },
  INACTIVE: { label: "Inactive", dot: "bg-signal-inactive", text: "text-signal-inactive", bg: "bg-signal-inactive/10" },
};

/** Compact form for dense table rows — reason available via native title tooltip. */
export const HealthDot: FC<{ health: Health; reason?: string }> = ({ health, reason }) => {
  const meta = HEALTH_META[health];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${meta.bg} ${meta.text}`}
      title={reason}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} aria-hidden="true" />
      {meta.label}
    </span>
  );
};

/** Full form for the dossier header — the reason is always printed, not hidden. */
export const HealthChip: FC<{ health: Health; reason: string }> = ({ health, reason }) => {
  const meta = HEALTH_META[health];
  return (
    <div className={`rounded-lg border border-line ${meta.bg} px-3 py-2`}>
      <div className={`flex items-center gap-2 text-sm font-semibold ${meta.text}`}>
        <span className={`h-2 w-2 rounded-full ${meta.dot}`} aria-hidden="true" />
        Relationship health: {meta.label}
      </div>
      <p className="mt-0.5 text-sm text-ink-soft">{reason}</p>
    </div>
  );
};
