import { useEffect, useState } from 'react';
import { LifeBuoy } from 'lucide-react';
import { StuckReason } from '../types';

interface Props {
  reasons: StuckReason[];
  onSelect: (code: string) => void;
  disabled?: boolean;
}

export function StuckMenu({ reasons, onSelect, disabled }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  return (
    <div className="rounded-md border border-line bg-surface shadow-panel">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="flex w-full items-center gap-2.5 px-5 py-4 text-left font-display text-[15px] font-medium text-ink disabled:opacity-40"
      >
        <LifeBuoy size={17} className="text-signal-gold" />
        I'm stuck
      </button>
      {open && (
        <div className="border-t border-line px-2 py-2">
          {reasons.map((r) => (
            <button
              key={r.code}
              onClick={() => {
                onSelect(r.code);
                setOpen(false);
              }}
              className="block w-full rounded-sm px-3.5 py-2.5 text-left text-[13px] text-ink-soft transition hover:bg-porcelain"
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
