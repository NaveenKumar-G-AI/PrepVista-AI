import type { PatternStrength } from '@/lib/types';

type EvidenceKind = 'DIRECT_EVIDENCE' | 'REPEATED_SIGNAL' | 'POSSIBLE_CONTRIBUTOR' | 'UNKNOWN';

const EVIDENCE_META: Record<EvidenceKind, { label: string; dot: string; tone: string }> = {
  DIRECT_EVIDENCE: { label: 'Direct Evidence', dot: '●', tone: 'text-pine border-pine/40 bg-pine-soft' },
  REPEATED_SIGNAL: { label: 'Repeated Signal', dot: '◐', tone: 'text-pine border-pine/40 bg-pine-soft' },
  POSSIBLE_CONTRIBUTOR: { label: 'Possible Contributor', dot: '○', tone: 'text-ink-soft border-line bg-paper' },
  UNKNOWN: { label: 'Unknown', dot: '○', tone: 'text-clay-strong border-clay/40 bg-clay-soft' },
};

// The recurring "specimen tag" used everywhere evidence quality needs to be
// legible at a glance — never lets a claim on screen go untagged.
export function EvidenceTag({ kind }: { kind: EvidenceKind }) {
  const meta = EVIDENCE_META[kind];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-tag border px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.08em] ${meta.tone}`}
    >
      <span aria-hidden="true">{meta.dot}</span>
      {meta.label}
    </span>
  );
}

const STRENGTH_META: Record<PatternStrength | 'none', { label: string; tone: string }> = {
  none: { label: 'No Pattern', tone: 'text-muted border-line bg-paper' },
  limited_evidence: { label: 'Limited Evidence', tone: 'text-muted border-line bg-paper' },
  emerging_pattern: { label: 'Emerging Pattern', tone: 'text-clay-strong border-clay/40 bg-clay-soft' },
  repeated_pattern: { label: 'Repeated Pattern', tone: 'text-pine border-pine/40 bg-pine-soft' },
};

export function PatternStrengthTag({ strength }: { strength: PatternStrength | 'none' }) {
  const meta = STRENGTH_META[strength];
  return (
    <span
      className={`inline-flex items-center rounded-tag border px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.08em] ${meta.tone}`}
    >
      {meta.label}
    </span>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'pine' | 'clay' }) {
  const toneClass =
    tone === 'pine'
      ? 'text-pine border-pine/40 bg-pine-soft'
      : tone === 'clay'
        ? 'text-clay-strong border-clay/40 bg-clay-soft'
        : 'text-muted border-line bg-paper';
  return (
    <span className={`inline-flex items-center rounded-tag border px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.08em] ${toneClass}`}>
      {children}
    </span>
  );
}
