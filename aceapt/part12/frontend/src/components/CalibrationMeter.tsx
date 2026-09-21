interface CalibrationMeterProps {
  /** 0-1 */
  value: number;
  ticks?: number;
  size?: 'sm' | 'md';
}

/**
 * A tick-marked gauge, not a generic progress bar. Used everywhere the
 * product needs to show "how sure are we" — decision confidence, and each
 * intervention type's response strength on the profile screen — so the same
 * visual language carries the same meaning across the whole app.
 */
export function CalibrationMeter({ value, ticks = 5, size = 'md' }: CalibrationMeterProps) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  const height = size === 'sm' ? 'h-1.5' : 'h-2.5';

  return (
    <div className={`relative w-full ${height} rounded-full bg-line overflow-hidden`}>
      <div className="absolute inset-y-0 left-0 rounded-full bg-teal transition-all duration-700 ease-out" style={{ width: `${pct}%` }} />
      <div className="absolute inset-0 flex">
        {Array.from({ length: ticks - 1 }).map((_, i) => (
          <div key={i} className="flex-1 border-r border-paper/80 last:border-r-0" />
        ))}
      </div>
    </div>
  );
}

export function EffectivenessBadge({ label }: { label: string }) {
  const positive = label === 'SUCCESSFUL' || label === 'PARTIALLY_EFFECTIVE';
  const negative = label === 'NEGATIVE_RESPONSE';
  const cls = positive
    ? 'bg-tealSoft text-teal'
    : negative
      ? 'bg-riskSoft text-risk'
      : 'bg-line text-muted';
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium tracking-wide ${cls}`}>
      {label.replaceAll('_', ' ').toLowerCase()}
    </span>
  );
}
