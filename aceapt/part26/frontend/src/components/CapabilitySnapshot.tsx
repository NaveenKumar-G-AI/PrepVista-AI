import type { TopicCapabilityState } from "../types";

function MetricBar({ label, value }: { label: string; value: number | null }) {
  const pct = value ?? 0;
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-4 font-mono text-[10px] uppercase tracking-wide text-faint">{label}</span>
      <div className="h-1 w-10 overflow-hidden rounded-full bg-ink-800">
        {value !== null && (
          <div
            className="h-full rounded-full bg-signal"
            style={{ width: `${Math.max(4, pct)}%`, opacity: pct >= 80 ? 1 : 0.55 }}
          />
        )}
      </div>
      <span className="w-7 font-mono text-[11px] text-muted">{value !== null ? `${value}` : "–"}</span>
    </div>
  );
}

interface CapabilitySnapshotProps {
  topics: TopicCapabilityState[];
}

export function CapabilitySnapshot({ topics }: CapabilitySnapshotProps) {
  if (topics.length === 0) return null;

  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {topics.map((t) => (
        <div
          key={t.topicId}
          className="flex min-w-[168px] flex-shrink-0 flex-col gap-1.5 rounded-xl border border-line-soft bg-ink-900/60 px-3 py-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-medium text-paper">{t.topicName}</span>
            {t.regressionSuspected && (
              <span title="Possible regression - worth a closer look" className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-alert" />
            )}
          </div>
          <MetricBar label="M" value={t.mastery} />
          <MetricBar label="R" value={t.retention} />
          <MetricBar label="T" value={t.transfer} />
        </div>
      ))}
    </div>
  );
}
