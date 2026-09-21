import type { ReadinessDimension } from "../types";

function Readout({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wider text-ink-3 font-body">{label}</span>
      <span className={`font-mono text-3xl font-tabular ${accent ? "text-route" : "text-ink-1"}`}>{value}</span>
    </div>
  );
}

export function ReadinessInstruments({
  readiness,
  targetReadiness,
  dimensions,
}: {
  readiness: number;
  targetReadiness: number;
  dimensions: ReadinessDimension[];
}) {
  const distance = Math.max(0, targetReadiness - readiness);
  const sortedDims = [...dimensions].sort((a, b) => b.gapContribution - a.gapContribution);
  const topDriver = sortedDims[0];

  return (
    <div className="rounded-lg border border-base-border bg-base-surface p-5">
      <div className="flex flex-wrap gap-x-10 gap-y-4">
        <Readout label="Readiness" value={`${readiness.toFixed(0)}%`} />
        <Readout label="Target" value={`${targetReadiness.toFixed(0)}%`} />
        <Readout label="Distance" value={`${distance.toFixed(0)} pts`} accent={distance > 0} />
      </div>

      {topDriver && distance > 0.5 && (
        <p className="mt-4 text-sm text-ink-2 font-body">
          The largest contributor to this gap is <span className="text-ink-1">{topDriver.label.toLowerCase()}</span>.
        </p>
      )}

      <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {dimensions.map((d) => (
          <div key={d.key} className="rounded-md bg-base-surface2 px-3 py-2.5 border border-base-border/60">
            <div className="text-[11px] uppercase tracking-wide text-ink-3 font-body">{d.label}</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="font-mono text-lg text-ink-1 font-tabular">{d.current.toFixed(0)}</span>
              <span className="font-mono text-xs text-ink-3">/ {d.target.toFixed(0)}</span>
            </div>
            <div className="mt-1.5 h-1 rounded-full bg-base-border overflow-hidden">
              <div className="h-full bg-route" style={{ width: `${Math.min(100, (d.current / Math.max(1, d.target)) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
