interface Props {
  label: string;
  value: number;
  delta?: number;
}

export function DimensionBar({ label, value, delta }: Props) {
  const color = value >= 75 ? 'bg-moss' : value >= 50 ? 'bg-brass' : 'bg-rust';

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="font-body text-sm text-bone">{label}</span>
        <span className="readout text-sm text-slate">
          {value}%
          {typeof delta === 'number' && delta !== 0 && (
            <span className={delta > 0 ? 'text-mosslight' : 'text-rustlight'}> {delta > 0 ? '+' : ''}{delta}</span>
          )}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-inkline">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(2, value)}%` }} />
      </div>
    </div>
  );
}
