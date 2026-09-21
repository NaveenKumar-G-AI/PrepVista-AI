import type { MemoryStateName } from '../types';

export function pct(n: number | null | undefined): string {
  return n == null ? '—' : `${Math.round(n * 100)}%`;
}

const REASON_LABEL: Record<string, string> = {
  AT_RISK: 'Retention at risk',
  RECURRING_WEAKNESS: 'Recurring weakness',
  VERIFICATION_REQUIRED: 'Verification required',
  DECAYING: 'Drifting down',
  FORGOTTEN: 'Needs full re-teaching',
};

export function reasonLabel(reason: string): string {
  return REASON_LABEL[reason] ?? reason;
}

// Tailwind v4 auto-generates text-signal / text-amber / text-sage / text-rose
// / text-text-faint etc. utilities directly from the --color-* tokens
// declared in index.css's @theme block.
const STATE_TEXT_CLASS: Record<MemoryStateName, string> = {
  NOT_LEARNED: 'text-text-faint',
  LEARNING: 'text-signal',
  RECENTLY_LEARNED: 'text-signal',
  STABLE: 'text-sage',
  DECAYING: 'text-amber',
  AT_RISK: 'text-amber',
  FORGOTTEN: 'text-rose',
  RECOVERING: 'text-signal',
  REINFORCED: 'text-sage',
  MASTERED: 'text-sage',
};

export function StateBadge({ state }: { state: MemoryStateName }) {
  return (
    <span className={`font-mono text-[11px] tracking-wider uppercase ${STATE_TEXT_CLASS[state]}`}>
      {state.replace(/_/g, ' ')}
    </span>
  );
}
