import { ReactNode } from 'react';
import { MasteryState } from '../lib/types';

const STATE_RANK: MasteryState[] = [
  'UNSEEN',
  'INTRODUCED',
  'FAMILIAR',
  'GUIDED',
  'PRACTICING',
  'INDEPENDENT',
  'STABLE',
  'RETAINED',
  'TRANSFERRED',
  'ROBUST_MASTERY',
];

function tone(state: MasteryState, label: string): 'strong' | 'developing' | 'gap' | 'flat' {
  if (label.toLowerCase().includes('gap')) return 'gap';
  if (label.toLowerCase().includes('not enough')) return 'flat';
  const r = STATE_RANK.indexOf(state);
  if (r >= STATE_RANK.indexOf('STABLE')) return 'strong';
  if (r >= STATE_RANK.indexOf('GUIDED')) return 'developing';
  return 'flat';
}

const TONE_STYLE: Record<string, string> = {
  strong: 'bg-accent-soft text-accent-700 border-accent/30',
  developing: 'bg-neutral-soft text-ink-700 border-line',
  gap: 'bg-warn-soft text-warn border-warn/30',
  flat: 'bg-neutral-soft text-ink-400 border-line',
};

export function StateBadge({ state, label }: { state: MasteryState; label: string }) {
  const t = tone(state, label);
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONE_STYLE[t]}`}>
      {label}
    </span>
  );
}

export function ConfidenceTag({ confidence }: { confidence: 'HIGH' | 'MEDIUM' | 'LOW' }) {
  const style = confidence === 'HIGH' ? 'text-accent-700' : confidence === 'MEDIUM' ? 'text-ink-600' : 'text-ink-400';
  return <span className={`font-mono text-xs uppercase tracking-wide ${style}`}>{confidence} confidence</span>;
}

export function Bar({ value, label }: { value: number | null; label: string }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-xs">
        <span className="text-ink-600">{label}</span>
        <span className="tabular font-mono text-ink-900">{value == null ? 'n/a' : `${Math.round(value * 100)}%`}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-soft">
        <div
          className="h-full rounded-full bg-ink-700"
          style={{ width: value == null ? '0%' : `${Math.round(value * 100)}%` }}
        />
      </div>
    </div>
  );
}

export function Card({ children, className = '', as: Comp = 'div' }: { children: ReactNode; className?: string; as?: any }) {
  return <Comp className={`rounded-lg border border-line bg-surface-raised ${className}`}>{children}</Comp>;
}

export function LoadingRows({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-lg border border-line bg-neutral-soft/60" />
      ))}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-line px-6 py-10 text-center">
      <p className="font-medium text-ink-900">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-ink-600">{body}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-warn/30 bg-warn-soft px-6 py-8 text-center">
      <p className="font-medium text-warn">Something went wrong</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-ink-700">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-3 rounded-md border border-warn/40 px-3 py-1.5 text-sm font-medium text-warn hover:bg-warn/10">
          Try again
        </button>
      )}
    </div>
  );
}
