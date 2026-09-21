import React from 'react';
import type { CapabilityState, EvidenceStrength } from '../types';

const LADDER: CapabilityState[] = [
  'NOT_ASSESSED',
  'LIMITED_EVIDENCE',
  'EMERGING',
  'DEVELOPING',
  'FUNCTIONAL',
  'STRONG',
  'ADVANCED',
  'VERIFIED',
  'MASTERED',
];

function tierColor(rank: number): string {
  if (rank <= 2) return 'var(--coral)';
  if (rank <= 5) return 'var(--amber)';
  return 'var(--teal)';
}

const STRENGTH_TREATMENT: Record<EvidenceStrength, { opacity: number; dashed: boolean }> = {
  NONE: { opacity: 0.15, dashed: true },
  LOW: { opacity: 0.4, dashed: true },
  MODERATE: { opacity: 0.7, dashed: false },
  HIGH: { opacity: 1, dashed: false },
  VERIFIED: { opacity: 1, dashed: false },
};

export function capabilityLabel(state: string): string {
  return state
    .toLowerCase()
    .split('_')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Position along the bar = capability. Fill treatment of the leading bar =
 * evidence strength (dashed/dim when the read is thin, solid when it's
 * well-evidenced, with a pip once it's been verified over time). This is
 * the one glyph students see everywhere — it never shows a bare percentage.
 */
export function ConfidenceGauge({
  capability,
  evidenceStrength,
  size = 'md',
}: {
  capability: CapabilityState;
  evidenceStrength: EvidenceStrength;
  size?: 'sm' | 'md';
}) {
  const rank = LADDER.indexOf(capability);
  const color = tierColor(Math.max(rank, 0));
  const treatment = STRENGTH_TREATMENT[evidenceStrength];

  return (
    <span
      className={`gauge gauge-${size}`}
      role="img"
      aria-label={`Capability: ${capabilityLabel(capability)}. Evidence strength: ${capabilityLabel(evidenceStrength)}.`}
    >
      {LADDER.map((_, i) => {
        const lit = i <= rank && rank >= 0;
        const isCurrent = i === rank;
        return (
          <span
            key={i}
            className="gauge-bar"
            style={{
              background: lit ? color : 'var(--border)',
              opacity: lit ? (isCurrent ? treatment.opacity : 0.85) : 0.5,
              boxShadow: isCurrent && treatment.dashed ? `inset 0 0 0 1px ${color}` : undefined,
            }}
          />
        );
      })}
      {evidenceStrength === 'VERIFIED' && <span className="gauge-pip" style={{ background: color }} aria-hidden="true" />}
    </span>
  );
}
