import { useState } from 'react';
import { Shuffle } from 'lucide-react';
import { ExplainResult } from '../types';

export function ExplainDifferentlyPanel({ onRequestExplanation }: { onRequestExplanation: (previousStyles: string[]) => Promise<ExplainResult> }) {
  const [history, setHistory] = useState<ExplainResult[]>([]);
  const [loading, setLoading] = useState(false);

  const current = history[history.length - 1];

  async function handleClick() {
    setLoading(true);
    try {
      const result = await onRequestExplanation(history.map((h) => h.style));
      setHistory((h) => [...h, result]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-md border border-line bg-surface shadow-panel">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <p className="font-display text-[13px] font-medium uppercase tracking-[0.14em] text-muted">Explanation</p>
        {current && <span className="font-mono text-[11px] text-signal-gold">{current.styleLabel}</span>}
      </div>

      <div className="px-5 py-4">
        {current ? (
          <p className="text-[14px] leading-relaxed text-ink">{current.text}</p>
        ) : (
          <p className="text-[13px] text-muted">Ask for an explanation in whichever style clicks for you.</p>
        )}
      </div>

      <div className="border-t border-line px-5 py-3.5">
        <button
          onClick={handleClick}
          disabled={loading}
          className="flex items-center gap-2 rounded-sm border border-line bg-surface px-3.5 py-2 font-body text-[13px] font-medium text-ink transition hover:border-ink/30 hover:bg-porcelain disabled:opacity-40"
        >
          <Shuffle size={14} />
          {loading ? 'Thinking…' : current ? 'Explain differently' : 'Explain this'}
        </button>
      </div>
    </div>
  );
}
