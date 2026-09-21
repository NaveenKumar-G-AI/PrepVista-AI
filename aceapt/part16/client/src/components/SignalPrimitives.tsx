import { Check, TriangleAlert, X, CircleDashed } from 'lucide-react';
import { SignalStatus } from '../types';

const STATUS_STYLES: Record<SignalStatus, { bg: string; fg: string; icon: React.ReactNode; label: string }> = {
  ok: { bg: 'bg-signal-tealSoft', fg: 'text-signal-teal', icon: <Check size={14} strokeWidth={2.5} />, label: 'Solid' },
  warning: { bg: 'bg-signal-goldSoft', fg: 'text-signal-gold', icon: <TriangleAlert size={14} strokeWidth={2.5} />, label: 'Needs attention' },
  fail: { bg: 'bg-signal-roseSoft', fg: 'text-signal-rose', icon: <X size={14} strokeWidth={2.5} />, label: 'Gap detected' },
  unknown: { bg: 'bg-line/60', fg: 'text-muted', icon: <CircleDashed size={14} strokeWidth={2.5} />, label: 'Not assessed' },
};

export function SignalRow({ label, status }: { label: string; status: SignalStatus }) {
  const s = STATUS_STYLES[status];
  return (
    <div className="flex items-center justify-between border-b border-line py-3 last:border-b-0">
      <span className="font-body text-[15px] text-ink">{label}</span>
      <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide ${s.bg} ${s.fg}`}>
        {s.icon}
        {s.label}
      </span>
    </div>
  );
}

export function ConfidenceTag({ confidence }: { confidence: 'HIGH' | 'MODERATE' | 'LOW' }) {
  const styles: Record<string, string> = {
    HIGH: 'bg-signal-tealSoft text-signal-teal',
    MODERATE: 'bg-signal-goldSoft text-signal-gold',
    LOW: 'bg-line/70 text-muted',
  };
  return (
    <span className={`rounded-sm px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider ${styles[confidence]}`}>
      Confidence: {confidence}
    </span>
  );
}

export function RootCauseTag({ cause }: { cause: string }) {
  return <span className="rounded-sm bg-ink/[0.06] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-ink-soft">{cause}</span>;
}
