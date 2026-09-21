'use client';

import { ReactNode, useId, useState } from 'react';
import type { EvidenceConfidence, ReadinessState, StageVerdict } from '@/lib/db/schema';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`card-rise rounded-xl border border-line bg-panel p-6 ${className}`}>{children}</div>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="eyebrow mb-2">{children}</div>;
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  type = 'button',
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  type?: 'button' | 'submit';
  className?: string;
}) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40';
  const variants: Record<string, string> = {
    primary: 'bg-signal text-white hover:bg-[#3f7bde]',
    secondary: 'bg-raised text-text-1 hover:bg-[#2b3140] border border-line',
    ghost: 'text-text-2 hover:text-text-1 hover:bg-raised',
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${variants[variant]} ${className}`}>
      {children}
    </button>
  );
}

export function ProgressBar({ value, max = 100, colorClass = 'bg-signal' }: { value: number; max?: number; colorClass?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-raised">
      <div className={`h-full rounded-full ${colorClass} transition-all duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

const VERDICT_STYLE: Record<StageVerdict, { label: string; color: string; dot: string }> = {
  strong: { label: 'Strong', color: 'text-ready', dot: 'bg-ready' },
  weak: { label: 'Weak', color: 'text-caution', dot: 'bg-caution' },
  critical: { label: 'Critical', color: 'text-critical', dot: 'bg-critical' },
  not_reached: { label: 'Not reached', color: 'text-text-3', dot: 'bg-text-3' },
};

export function VerdictBadge({ verdict }: { verdict: StageVerdict }) {
  const s = VERDICT_STYLE[verdict];
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${s.color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />
      {s.label}
    </span>
  );
}

const CONFIDENCE_LABEL: Record<EvidenceConfidence, string> = { insufficient: 'Insufficient', low: 'Low', medium: 'Medium', high: 'High' };
export function ConfidenceBadge({ confidence }: { confidence: EvidenceConfidence }) {
  const color = confidence === 'high' ? 'text-ready' : confidence === 'medium' ? 'text-signal' : confidence === 'low' ? 'text-caution' : 'text-text-3';
  return <span className={`font-data text-sm ${color}`}>{CONFIDENCE_LABEL[confidence]}</span>;
}

const STATE_LABEL: Record<ReadinessState, string> = {
  early: 'Early',
  developing: 'Developing',
  near_ready: 'Near Ready',
  simulation_ready: 'Simulation Ready',
  verified_ready: 'Verified Ready',
};
export function ReadinessStateBadge({ state }: { state: ReadinessState }) {
  const color = state === 'simulation_ready' || state === 'verified_ready' ? 'bg-ready/15 text-ready' : state === 'near_ready' ? 'bg-signal/15 text-signal' : state === 'developing' ? 'bg-caution/15 text-caution' : 'bg-raised text-text-2';
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${color}`}>{STATE_LABEL[state]}</span>;
}

export function WhyExplain({ question, children }: { question: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="border-t border-line pt-3 first:border-t-0 first:pt-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 text-left text-sm text-text-2 hover:text-text-1"
      >
        <span>{question}</span>
        <span className={`font-data text-xs transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>
      {open && (
        <div id={id} className="mt-2 text-sm leading-relaxed text-text-2">
          {children}
        </div>
      )}
    </div>
  );
}
