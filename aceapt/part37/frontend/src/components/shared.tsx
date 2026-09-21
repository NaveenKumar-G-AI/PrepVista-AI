import type { ReactNode } from 'react';
import type { CapabilityEvidenceLabel, ConfidenceLevel, ReadinessState } from '../types';

type Tone = 'evidence' | 'pending' | 'gap' | 'neutral';

const TONE_CLASSES: Record<Tone, string> = {
  evidence: 'bg-evidence-soft text-evidence border-evidence/25',
  pending: 'bg-pending-soft text-pending border-pending/25',
  gap: 'bg-gap-soft text-gap border-gap/25',
  neutral: 'bg-paper-dim text-ink/70 border-paper-line',
};

export function StatusPill({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-wide ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

export function readinessStateTone(state: ReadinessState): Tone {
  switch (state) {
    case 'STRONG_EVIDENCE':
    case 'READY_TO_TEST':
      return 'evidence';
    case 'VALIDATING':
    case 'DEVELOPING':
    case 'BUILDING':
      return 'pending';
    case 'EXPLORING':
    case 'UNKNOWN':
    default:
      return 'neutral';
  }
}

export function confidenceTone(level: ConfidenceLevel): Tone {
  switch (level) {
    case 'HIGH':
      return 'evidence';
    case 'MEDIUM':
      return 'pending';
    case 'LOW':
    default:
      return 'neutral'; // low confidence is "not enough is known yet", not itself a bad signal
  }
}

export function capabilityLabelTone(label: CapabilityEvidenceLabel): Tone {
  switch (label) {
    case 'STRONG':
      return 'evidence';
    case 'DEVELOPING':
      return 'pending';
    case 'LIMITED':
    case 'UNKNOWN':
    default:
      return 'neutral';
  }
}

export const READABLE_STATE: Record<ReadinessState, string> = {
  UNKNOWN: 'Unknown',
  EXPLORING: 'Exploring',
  BUILDING: 'Building',
  DEVELOPING: 'Developing',
  VALIDATING: 'Validating',
  READY_TO_TEST: 'Ready to test',
  STRONG_EVIDENCE: 'Strong evidence',
};

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-paper-line bg-paper-dim/40 px-6 py-14 text-center">
      <p className="font-medium text-ink">{title}</p>
      <p className="max-w-sm text-sm text-ink/65">{description}</p>
      {action}
    </div>
  );
}
