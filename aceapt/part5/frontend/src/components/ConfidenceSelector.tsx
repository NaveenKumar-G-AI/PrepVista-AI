const LEVELS: { value: number; label: string }[] = [
  { value: 1, label: "Very unsure" },
  { value: 2, label: "Unsure" },
  { value: 3, label: "Neutral" },
  { value: 4, label: "Confident" },
  { value: 5, label: "Very confident" },
];

export function ConfidenceSelector({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[11px] uppercase tracking-wider text-ink-700/50">How sure?</span>
      <div className="flex gap-1">
        {LEVELS.map((l) => (
          <button
            key={l.value}
            type="button"
            title={l.label}
            aria-label={l.label}
            aria-pressed={value === l.value}
            onClick={() => onChange(value === l.value ? null : l.value)}
            className={`h-6 w-6 rounded-full border text-[10px] font-mono transition-colors ${
              value === l.value ? "border-signal-cyan bg-signal-cyan text-white" : "border-ink-900/15 text-ink-700/50 hover:border-signal-cyan/50"
            }`}
          >
            {l.value}
          </button>
        ))}
      </div>
    </div>
  );
}
