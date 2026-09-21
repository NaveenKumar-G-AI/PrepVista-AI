import { STRIP_DIMS, StripDim, StripState } from '../lib/evidenceStrip';

const STATE_STYLE: Record<StripState, string> = {
  confirmed: 'bg-accent border-accent',
  gap: 'bg-warn-soft border-warn',
  untested: 'bg-transparent border-line border-dashed',
};

export function EvidenceStrip({ dims, size = 'md', showLabels = false }: { dims: Record<StripDim, StripState>; size?: 'sm' | 'md'; showLabels?: boolean }) {
  const dot = size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2';
  return (
    <div className="flex items-center gap-2.5" role="img" aria-label={`Evidence: ${STRIP_DIMS.map((d) => `${d} ${dims[d]}`).join(', ')}`}>
      {STRIP_DIMS.map((d) => (
        <div key={d} className="flex flex-col items-center gap-1">
          <span className={`block rounded-full border ${dot} ${STATE_STYLE[dims[d]]}`} title={`${d}: ${dims[d]}`} />
          {showLabels && <span className="text-[10px] uppercase tracking-wide text-ink-400">{d.slice(0, 4)}</span>}
        </div>
      ))}
    </div>
  );
}

export function EvidenceStripLegend() {
  return (
    <div className="flex flex-wrap items-center gap-4 text-xs text-ink-600">
      <span className="flex items-center gap-1.5">
        <span className="block h-2 w-2 rounded-full border border-accent bg-accent" /> Confirmed
      </span>
      <span className="flex items-center gap-1.5">
        <span className="block h-2 w-2 rounded-full border border-warn bg-warn-soft" /> Gap found
      </span>
      <span className="flex items-center gap-1.5">
        <span className="block h-2 w-2 rounded-full border border-dashed border-line" /> Not tested yet
      </span>
    </div>
  );
}
