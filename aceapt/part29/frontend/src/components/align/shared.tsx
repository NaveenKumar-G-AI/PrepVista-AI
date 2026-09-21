import React from 'react';
import { AlignmentState, ConfidenceBand } from '../../types/align.types';

export const STATE_LABEL: Record<AlignmentState, string> = {
  STRONGLY_ALIGNED: 'Strongly Aligned',
  DEVELOPING_ALIGNMENT: 'Developing Alignment',
  LOW_ALIGNMENT: 'Low Alignment',
  INSUFFICIENT_EVIDENCE: 'Insufficient Evidence',
};

const STATE_COLOR: Record<AlignmentState, string> = {
  STRONGLY_ALIGNED: 'text-align-readiness border-align-readiness-dim bg-align-readiness/10',
  DEVELOPING_ALIGNMENT: 'text-align-caution border-align-caution/50 bg-align-caution/10',
  LOW_ALIGNMENT: 'text-align-critical border-align-critical/50 bg-align-critical/10',
  INSUFFICIENT_EVIDENCE: 'text-align-text-tertiary border-align-border-strong bg-align-surface-raised',
};

export function StateBadge({ state }: { state: AlignmentState }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-body text-xs font-medium ${STATE_COLOR[state]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {STATE_LABEL[state]}
    </span>
  );
}

const CONFIDENCE_LABEL: Record<ConfidenceBand, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' };
const CONFIDENCE_FILL: Record<ConfidenceBand, number> = { LOW: 1, MEDIUM: 2, HIGH: 3 };

export function ConfidenceMeter({ band }: { band: ConfidenceBand }) {
  const filled = CONFIDENCE_FILL[band];
  return (
    <span className="inline-flex items-center gap-1.5" title={`Evidence confidence: ${CONFIDENCE_LABEL[band]}`}>
      <span className="flex items-end gap-0.5" aria-hidden="true">
        {[1, 2, 3].map((bar) => (
          <span
            key={bar}
            className={`w-1 rounded-sm ${bar <= filled ? 'bg-align-text-secondary' : 'bg-align-border-strong'}`}
            style={{ height: `${bar * 3 + 3}px` }}
          />
        ))}
      </span>
      <span className="font-body text-xs text-align-text-tertiary">{CONFIDENCE_LABEL[band]} confidence</span>
    </span>
  );
}

export function MonoStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null;
  tone: 'fit' | 'readiness';
}) {
  const toneClass = tone === 'fit' ? 'text-align-fit' : 'text-align-readiness';
  return (
    <div>
      <div className="font-body text-xs uppercase tracking-wider text-align-text-tertiary">{label}</div>
      <div className={`font-mono text-4xl font-medium tabular-nums ${toneClass}`}>
        {value === null ? <span className="text-align-text-tertiary">{'\u2014'}</span> : `${value}%`}
      </div>
    </div>
  );
}

export function LevelPill({ level, met }: { level: string; met?: boolean }) {
  const label = level.replaceAll('_', ' ').toLowerCase();
  return (
    <span
      className={`rounded border px-1.5 py-0.5 font-mono text-[11px] capitalize ${
        met ? 'border-align-readiness-dim text-align-readiness' : 'border-align-border-strong text-align-text-secondary'
      }`}
    >
      {label}
    </span>
  );
}
