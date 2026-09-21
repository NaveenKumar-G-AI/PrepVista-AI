import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { PriorityBoardData, PrioritySignal } from '../types';

const COLUMN_META = {
  top: { label: 'Top priority', accent: 'text-rose', border: 'border-rose/30' },
  secondary: { label: 'Secondary', accent: 'text-amber', border: 'border-amber/30' },
  maintain: { label: 'Maintain', accent: 'text-teal', border: 'border-teal/30' },
} as const;

export default function PriorityBoard() {
  const [board, setBoard] = useState<PriorityBoardData | null>(null);

  useEffect(() => {
    api.priorities().then(setBoard);
  }, []);

  if (!board) return <div className="h-64 rounded-xl border border-line bg-panel animate-pulse" />;

  return (
    <div className="grid gap-5 md:grid-cols-3">
      {(['top', 'secondary', 'maintain'] as const).map((col) => (
        <div key={col} className={`rounded-xl border ${COLUMN_META[col].border} bg-panel p-5`}>
          <p className={`font-mono text-[11px] tracking-[0.2em] uppercase ${COLUMN_META[col].accent}`}>
            {COLUMN_META[col].label}
          </p>
          <div className="mt-4 space-y-3">
            {board[col].length === 0 && <p className="text-sm text-slate">Nothing here right now.</p>}
            {board[col].map((s) => (
              <SignalCard key={s.skill_id} signal={s} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SignalCard({ signal }: { signal: PrioritySignal }) {
  return (
    <div className="rounded-lg border border-line bg-ink/30 p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{signal.skill_name}</span>
        <span className="font-mono text-xs tabular text-slate">{signal.priority_score.toFixed(1)}</span>
      </div>
      <p className="mt-1 font-mono text-[10px] tracking-widest text-slate uppercase">
        {signal.problem_type.replace(/_/g, ' ')}
      </p>
      <p className="mt-2 text-xs text-slate leading-relaxed">{signal.details}</p>
    </div>
  );
}
