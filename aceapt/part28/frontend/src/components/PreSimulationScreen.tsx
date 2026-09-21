import type { TargetedVerificationPlan } from '../api/types.js';

export interface PreSimulationScreenProps {
  plan: TargetedVerificationPlan;
  onStart: () => void;
  onCancel: () => void;
  busy?: boolean;
}

const CONDITION_LABEL: Record<TargetedVerificationPlan['condition'], string> = {
  TIME_PRESSURE: 'Time pressure',
  NOVELTY: 'Novelty',
  CONSISTENCY: 'Consistency',
  STANDARD: 'Standard coverage',
};

/** Section 32 — "this creates trust": never silently launch a random test.
 *  Every field here is the actual plan the backend selected, not a
 *  client-side guess. */
export function PreSimulationScreen({ plan, onStart, onCancel, busy }: PreSimulationScreenProps) {
  return (
    <section className="proof-root" style={{ background: 'var(--proof-paper-raised)', border: '1px solid var(--proof-line)', borderRadius: 'var(--proof-radius)', padding: '28px 32px', maxWidth: 560 }}>
      <p style={{ textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: 11, color: 'var(--proof-ink-soft)', margin: 0 }}>
        Why this verification?
      </p>
      <h2 className="proof-display" style={{ fontSize: 22, margin: '8px 0 16px' }}>
        We&apos;re testing: {CONDITION_LABEL[plan.condition]}
      </h2>

      <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', rowGap: 8, columnGap: 16, margin: '0 0 16px' }}>
        <dt style={{ color: 'var(--proof-ink-soft)' }}>Capability</dt>
        <dd className="proof-numeric" style={{ margin: 0 }}>{plan.capability}</dd>
        <dt style={{ color: 'var(--proof-ink-soft)' }}>Duration</dt>
        <dd className="proof-numeric" style={{ margin: 0 }}>{`${plan.durationMinutes} minutes`}</dd>
        <dt style={{ color: 'var(--proof-ink-soft)' }}>Questions</dt>
        <dd className="proof-numeric" style={{ margin: 0 }}>{plan.simulationProfile.questionCount}</dd>
      </dl>

      <p style={{ color: 'var(--proof-ink-soft)', margin: '0 0 24px' }}>{plan.reason}</p>

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="button" onClick={onStart} disabled={busy} className="proof-display"
          style={{
            background: 'var(--proof-ink)', color: 'var(--proof-paper-raised)', border: 'none',
            borderRadius: 'var(--proof-radius)', padding: '11px 20px', fontSize: 15,
            cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? 'Starting…' : 'Start verification'}
        </button>
        <button
          type="button" onClick={onCancel} disabled={busy}
          style={{
            background: 'none', color: 'var(--proof-ink-soft)', border: '1px solid var(--proof-line)',
            borderRadius: 'var(--proof-radius)', padding: '11px 20px', fontSize: 15, cursor: 'pointer',
          }}
        >
          Not now
        </button>
      </div>
    </section>
  );
}
