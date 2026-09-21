import type { PathHistoryEvent, PathSnapshot, WeeklyReview } from "../types";

export function TodayPanel({ narrative }: { narrative: string }) {
  return (
    <div className="rounded-lg border border-base-border bg-base-surface p-5">
      <div className="text-[11px] uppercase tracking-wider text-ink-3 font-body mb-2">Today</div>
      <p className="text-sm text-ink-1 font-body leading-relaxed">{narrative}</p>
    </div>
  );
}

export function WeeklyReviewPanel({ review }: { review: WeeklyReview }) {
  return (
    <div className="rounded-lg border border-base-border bg-base-surface p-5">
      <div className="text-[11px] uppercase tracking-wider text-ink-3 font-body mb-3">This week</div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-ink-3 font-body">Readiness</div>
          <div className="font-mono text-xl text-ink-1 font-tabular">{review.readinessDelta != null ? `${review.readinessDelta >= 0 ? "+" : ""}${review.readinessDelta.toFixed(1)}` : "—"}</div>
        </div>
        <div>
          <div className="text-xs text-ink-3 font-body">Milestones verified</div>
          <div className="font-mono text-xl text-ink-1 font-tabular">{review.milestonesVerified}</div>
        </div>
      </div>
      <div className="mt-4 pt-4 border-t border-base-border">
        <div className="text-xs text-ink-3 font-body">Current bottleneck</div>
        <div className="text-sm text-ink-1 font-body mt-0.5">{review.bottleneck ?? "None"}</div>
      </div>
      <div className="mt-3">
        <div className="text-xs text-ink-3 font-body">Next focus</div>
        <div className="text-sm text-ink-1 font-body mt-0.5">{review.nextFocus}</div>
      </div>
    </div>
  );
}

export function PathHistoryPanel({ snapshots, events }: { snapshots: PathSnapshot[]; events: PathHistoryEvent[] }) {
  const named = events.filter((e) => e.summary);
  return (
    <div className="rounded-lg border border-base-border bg-base-surface p-5">
      <div className="text-[11px] uppercase tracking-wider text-ink-3 font-body mb-3">Path history</div>
      {named.length === 0 ? (
        <p className="text-sm text-ink-3 font-body">No changes recorded yet.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {named.map((e, i) => (
            <li key={i} className="flex gap-3">
              <span className="font-mono text-xs text-ink-3 shrink-0 pt-0.5 w-20">
                {new Date(e.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
              <span className="text-sm text-ink-1 font-body">{e.summary}</span>
            </li>
          ))}
        </ul>
      )}
      {snapshots.length > 1 && (
        <div className="mt-5 pt-4 border-t border-base-border">
          <div className="flex items-end gap-1 h-16">
            {snapshots.slice(-24).map((s, i) => (
              <div key={i} className="flex-1 bg-route/60 rounded-sm" style={{ height: `${Math.max(4, s.readiness)}%` }} title={`${s.readiness.toFixed(0)}%`} />
            ))}
          </div>
          <div className="text-[10px] text-ink-3 font-body mt-1">Readiness over time</div>
        </div>
      )}
    </div>
  );
}
