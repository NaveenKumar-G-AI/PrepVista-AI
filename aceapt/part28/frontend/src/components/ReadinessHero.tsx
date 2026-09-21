import type { CSSProperties } from 'react';
import type { ProofStatus } from '../api/types.js';
import { EvidenceStackVisual } from './EvidenceStackVisual.js';

export interface ReadinessHeroProps {
  status: ProofStatus;
  onProveReadiness: () => void;
  busy?: boolean;
}

const STATUS_COPY: Record<string, { headline: string; tone: 'verified' | 'gap' }> = {
  STRONGLY_VERIFIED: { headline: 'Readiness verified', tone: 'verified' },
  VERIFIED: { headline: 'Readiness verified', tone: 'verified' },
  CONDITIONALLY_VERIFIED: { headline: 'Not yet verified', tone: 'gap' },
  EMERGING_EVIDENCE: { headline: 'Not yet verified', tone: 'gap' },
  NOT_VERIFIED: { headline: 'Not yet verified', tone: 'gap' },
};

/** Section 26/27 — Section 60's microcopy discipline applies throughout:
 *  never "you will pass", only what has actually been demonstrated. */
export function ReadinessHero({ status, onProveReadiness, busy }: ReadinessHeroProps) {
  if (!status.hasResult || !status.result) {
    return (
      <section className="proof-root" style={heroStyle}>
        <p style={eyebrowStyle}>ACEAPT PROOF · Evidence-Based Readiness Verification</p>
        <h1 className="proof-display" style={{ fontSize: 28, margin: '8px 0 12px' }}>
          Don&apos;t just predict you&apos;re ready. Demonstrate it.
        </h1>
        <p style={{ color: 'var(--proof-ink-soft)', maxWidth: 520, margin: '0 0 20px' }}>
          You haven&apos;t run a verification yet. PROOF looks at what you&apos;ve already shown, finds the
          highest-value gap in the evidence, and builds a short targeted check around exactly that.
        </p>
        <ProveButton onClick={onProveReadiness} busy={busy} label="Prove my readiness" />
      </section>
    );
  }

  const { result, agingState } = status;
  const copy = STATUS_COPY[result.status] ?? STATUS_COPY.NOT_VERIFIED!;
  const sealed = copy.tone === 'verified';

  let confidenceLine = `Evidence confidence: ${result.confidence}`;
  if (agingState === 'AGING') {
    confidenceLine += ' · This verification is aging — a short recheck is recommended.';
  } else if (agingState === 'RECHECK_RECOMMENDED' && sealed) {
    confidenceLine += ' · This verification has aged past its recheck window.';
  }

  return (
    <section className="proof-root" style={heroStyle}>
      <p style={eyebrowStyle}>ACEAPT PROOF · Evidence-Based Readiness Verification</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <h1 className="proof-display" style={{ fontSize: 30, margin: '4px 0 4px', color: sealed ? 'var(--proof-verified)' : 'var(--proof-ink)' }}>
          {copy.headline}
        </h1>
        {sealed && <span aria-hidden="true" style={{ color: 'var(--proof-verified)', fontSize: 20 }}>✓</span>}
      </div>
      <p style={{ color: 'var(--proof-ink-soft)', margin: '0 0 4px', maxWidth: 560 }}>
        {sealed
          ? 'Your demonstrated performance currently meets your target readiness criteria.'
          : `Current evidence is at ${(result.factors.find((f) => f.name === 'Target Capability')?.score ?? 0) * 100 | 0}% against your target.`}
      </p>
      <p className="proof-numeric" style={{ color: 'var(--proof-ink-soft)', fontSize: 13, margin: '0 0 20px' }}>
        {confidenceLine}
      </p>

      <div style={{ margin: '4px 0 24px', maxWidth: 640 }}>
        <EvidenceStackVisual factors={result.factors} sealed={sealed} />
      </div>

      <ProveButton onClick={onProveReadiness} busy={busy} label={sealed ? 'Run verification again' : 'Prove my readiness'} />
    </section>
  );
}

function ProveButton({ onClick, busy, label }: { onClick: () => void; busy?: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="proof-display"
      style={{
        background: 'var(--proof-ink)',
        color: 'var(--proof-paper-raised)',
        border: 'none',
        borderRadius: 'var(--proof-radius)',
        padding: '12px 22px',
        fontSize: 15,
        cursor: busy ? 'default' : 'pointer',
        opacity: busy ? 0.6 : 1,
      }}
    >
      {busy ? 'Analyzing your evidence…' : label}
    </button>
  );
}

const heroStyle: CSSProperties = {
  background: 'var(--proof-paper-raised)',
  border: '1px solid var(--proof-line)',
  borderRadius: 'var(--proof-radius)',
  padding: '28px 32px',
};

const eyebrowStyle: CSSProperties = {
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontSize: 11,
  color: 'var(--proof-ink-soft)',
  margin: 0,
};
