"use client";

export function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="w-full" role="progressbar" aria-valuenow={current} aria-valuemin={0} aria-valuemax={total}>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-xs tabular-nums tracking-wide text-ink-950/50">
          {String(current).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </span>
      </div>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-ink-950/8">
        <div
          className="h-full rounded-full bg-signal transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
