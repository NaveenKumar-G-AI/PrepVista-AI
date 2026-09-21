import { InterventionHistoryRow } from '../types';

export function InterventionHistoryList({ rows }: { rows: InterventionHistoryRow[] }) {
  if (rows.length === 0) {
    return <div className="rounded-md border border-line bg-surface p-5 text-[13px] text-muted">No interventions recorded yet.</div>;
  }

  return (
    <div className="rounded-md border border-line bg-surface shadow-panel">
      <div className="border-b border-line px-5 py-3">
        <p className="font-display text-[13px] font-medium uppercase tracking-[0.14em] text-muted">Intervention history</p>
      </div>
      <div className="divide-y divide-line">
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-5 py-3">
            <div>
              <p className="text-[13px] font-medium text-ink">{row.skillLabel}</p>
              <p className="font-mono text-[11px] uppercase tracking-wide text-muted">{row.rootCauseLabel}</p>
            </div>
            <span
              className={`justify-self-end rounded-full px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide ${
                row.result === 'Improved' ? 'bg-signal-tealSoft text-signal-teal' : 'bg-signal-goldSoft text-signal-gold'
              }`}
            >
              {row.result}
            </span>
            <p className="text-[13px] text-ink-soft">{row.interventionLabel}</p>
            <p className="justify-self-end text-[12px] text-muted">Next: {row.next}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
