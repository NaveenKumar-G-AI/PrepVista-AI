import { useState } from 'react';
import { HintResult } from '../types';

const MAX_LEVEL = 5;

export function ProgressiveHints({ onRequestHint }: { onRequestHint: () => Promise<HintResult> }) {
  const [hints, setHints] = useState<HintResult[]>([]);
  const [loading, setLoading] = useState(false);

  const nextLevel = hints.length + 1;
  const isFinal = hints[hints.length - 1]?.isFinal ?? false;

  async function handleClick() {
    setLoading(true);
    try {
      const result = await onRequestHint();
      setHints((h) => [...h, result]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-md border border-line bg-surface shadow-panel">
      <div className="border-b border-line px-5 py-3">
        <p className="font-display text-[13px] font-medium uppercase tracking-[0.14em] text-muted">Hints</p>
      </div>

      <div className="px-5 py-3">
        {hints.length === 0 && <p className="py-2 text-[13px] text-muted">No hints used yet — hints reveal gradually, one level at a time.</p>}
        <ol className="space-y-0">
          {hints.map((h) => (
            <li key={h.level} className="flex gap-3 border-l-2 border-signal-gold/40 py-2.5 pl-4">
              <span className="flex-none font-mono text-[11px] font-medium text-signal-gold">L{h.level}</span>
              <span className="text-[13px] leading-relaxed text-ink-soft">{h.text}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="border-t border-line px-5 py-3.5">
        <button
          onClick={handleClick}
          disabled={loading || isFinal}
          className="rounded-sm border border-line bg-surface px-3.5 py-2 font-body text-[13px] font-medium text-ink transition hover:border-ink/30 hover:bg-porcelain disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? 'Loading…' : isFinal ? 'No further hints' : `Show hint ${nextLevel} of ${MAX_LEVEL}`}
        </button>
      </div>
    </div>
  );
}
