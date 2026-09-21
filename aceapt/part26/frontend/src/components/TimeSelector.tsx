import { useState } from "react";

const PRESETS = [5, 10, 15, 30, 60];

interface TimeSelectorProps {
  value: number | null;
  onSelect: (minutes: number) => void;
  disabled?: boolean;
}

export function TimeSelector({ value, onSelect, disabled }: TimeSelectorProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState("20");
  const isPreset = value !== null && PRESETS.includes(value);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {PRESETS.map((minutes) => (
        <button
          key={minutes}
          type="button"
          disabled={disabled}
          onClick={() => {
            setCustomOpen(false);
            onSelect(minutes);
          }}
          className={`rounded-full border px-3.5 py-1.5 font-mono text-sm transition-colors disabled:opacity-40 ${
            value === minutes
              ? "border-signal bg-signal/15 text-signal"
              : "border-line text-muted hover:border-line-soft hover:text-paper"
          }`}
        >
          {minutes}m
        </button>
      ))}

      {!customOpen && (
        <button
          type="button"
          disabled={disabled}
          onClick={() => setCustomOpen(true)}
          className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors disabled:opacity-40 ${
            value !== null && !isPreset
              ? "border-signal bg-signal/15 text-signal"
              : "border-line text-muted hover:border-line-soft hover:text-paper"
          }`}
        >
          Custom
        </button>
      )}

      {customOpen && (
        <form
          className="flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            const n = parseInt(customValue, 10);
            if (Number.isFinite(n) && n > 0) onSelect(n);
          }}
        >
          <input
            autoFocus
            type="number"
            min={1}
            max={240}
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            className="w-16 rounded-full border border-line bg-ink-900 px-3 py-1.5 font-mono text-sm text-paper outline-none focus:border-signal"
          />
          <span className="text-sm text-muted">min</span>
          <button
            type="submit"
            className="rounded-full border border-signal bg-signal/15 px-3 py-1.5 text-sm text-signal"
          >
            Set
          </button>
        </form>
      )}
    </div>
  );
}
