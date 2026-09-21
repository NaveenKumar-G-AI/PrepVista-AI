import type { CompleteVerificationResponse } from '../api/types.js';
import { EvidenceStackVisual } from './EvidenceStackVisual.js';

export interface VerificationResultScreenProps {
  outcome: CompleteVerificationResponse;
  onViewEvidence: () => void;
  onFixTheGap: () => void;
  onProveAgain: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  STRONGLY_VERIFIED: 'READINESS VERIFIED',
  VERIFIED: 'READINESS VERIFIED',
  CONDITIONALLY_VERIFIED: 'CONDITIONALLY VERIFIED',
  EMERGING_EVIDENCE: 'EMERGING EVIDENCE',
  NOT_VERIFIED: 'NOT VERIFIED',
};

/** Section 34 — never a bare percentage. Always: status, what was
 *  demonstrated, the main limitation if any, and a clear next action. */
export function VerificationResultScreen({ outcome, onViewEvidence, onFixTheGap, onProveAgain }: VerificationResultScreenProps) {
  const { result } = outcome;
  const verified = result.status === 'VERIFIED' || result.status === 'STRONGLY_VERIFIED';
  const label = STATUS_LABEL[result.status] ?? result.status;

  return (
    <section className="proof-root" style={{ background: 'var(--proof-paper-raised)', border: '1px solid var(--proof-line)', borderRadius: 'var(--proof-radius)', padding: '28px 32px', maxWidth: 640 }}>
      <p style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11, color: 'var(--proof-ink-soft)', margin: 0 }}>
        Verification result
      </p>
      <h2 className="proof-display" style={{ fontSize: 24, margin: '8px 0 12px', color: verified ? 'var(--proof-verified)' : 'var(--proof-ink)' }}>
        {label}
      </h2>
      <p style={{ color: 'var(--proof-ink-soft)', margin: '0 0 20px', maxWidth: 520 }}>{outcome.narrative}</p>

      <div style={{ margin: '0 0 20px' }}>
        <EvidenceStackVisual factors={result.factors} sealed={verified} />
      </div>

      {!verified && result.failureSignatures.length > 0 && (
        <p style={{ color: 'var(--proof-gap)', margin: '0 0 20px', fontSize: 14 }}>
          <strong className="proof-display" style={{ fontWeight: 600 }}>Main limitation: </strong>
          {result.failureSignatures[0]!.explanation}
        </p>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={onViewEvidence} style={secondaryButtonStyle}>View full evidence</button>
        {verified
          ? <button type="button" onClick={onProveAgain} style={secondaryButtonStyle}>Run verification again</button>
          : <button type="button" onClick={onFixTheGap} style={primaryButtonStyle}>Fix the gap</button>}
      </div>
    </section>
  );
}

const primaryButtonStyle = {
  background: 'var(--proof-ink)', color: 'var(--proof-paper-raised)', border: 'none',
  borderRadius: 'var(--proof-radius)', padding: '11px 20px', fontSize: 15, cursor: 'pointer',
  fontFamily: 'var(--proof-font-display)',
} as const;

const secondaryButtonStyle = {
  background: 'none', color: 'var(--proof-ink-soft)', border: '1px solid var(--proof-line)',
  borderRadius: 'var(--proof-radius)', padding: '11px 20px', fontSize: 15, cursor: 'pointer',
} as const;
