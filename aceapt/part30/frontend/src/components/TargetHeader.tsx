import type { PathMode, ReadinessProjection, Target } from "../types";

const MODE_COPY: Record<PathMode, { label: string; className: string }> = {
  STANDARD: { label: "Standard", className: "text-ink-2 border-base-border" },
  FAST_TRACK: { label: "Fast track", className: "text-route border-route/40" },
  DEEP_MASTERY: { label: "Deep mastery", className: "text-verified border-verified/40" },
  RECOVERY: { label: "Recovery", className: "text-risk border-risk/40" },
  REASSESSMENT: { label: "Reassessment", className: "text-ink-2 border-base-border" },
};

export function TargetHeader({
  target,
  mode,
  deadlineDays,
  projection,
  slot,
}: {
  target: Target;
  mode: PathMode;
  deadlineDays: number | null;
  projection: ReadinessProjection;
  slot: string;
}) {
  const modeCopy = MODE_COPY[mode];
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-ink-3 font-body">
          <span>ACEAPT PATH</span>
          {slot !== "PRIMARY" && <span className="rounded-full border border-base-border px-2 py-0.5">{slot.toLowerCase()}</span>}
        </div>
        <h1 className="font-display text-4xl text-ink-1 mt-1">{target.name}</h1>
        {deadlineDays != null && <p className="text-sm text-ink-3 font-body mt-1">{deadlineDays}-day preparation window</p>}
      </div>
      <div className="flex flex-col items-end gap-2">
        <span className={`text-xs font-body border rounded-full px-2.5 py-1 ${modeCopy.className}`}>{modeCopy.label}</span>
        <span className="text-xs text-ink-3 font-body text-right max-w-[220px]">
          Projected readiness: <span className="text-ink-2">{projection.windowLabel}</span>
          {projection.confidence !== "HIGH" && projection.weeksLow != null && <span> · confidence: {projection.confidence.toLowerCase()}</span>}
        </span>
      </div>
    </div>
  );
}
