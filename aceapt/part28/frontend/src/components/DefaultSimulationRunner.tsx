import { useEffect, useState } from 'react';
import type { TargetedVerificationPlan } from '../api/types.js';

export interface SimulationRunnerProps {
  plan: TargetedVerificationPlan;
  onSubmitResponse: (response: {
    questionIndex: number; capability: string; difficulty: string; novelty: string;
    isCorrect: boolean; timeTakenMs: number; expectedTimeMs: number; skipped?: boolean;
    changedAnswer?: boolean; stalled?: boolean;
  }) => Promise<void>;
  onComplete: () => Promise<void>;
}

const EXPECTED_MS_PER_QUESTION = 60_000;

/**
 * Section 33/47 — during simulation the interface stays clean and never
 * reveals whether the student is passing. This component is a documented
 * stand-in: PROOF does not own question content or navigation chrome (that
 * already exists elsewhere in ACEAPT), so this renders a minimal,
 * honestly-labeled placeholder rather than reinventing a question bank.
 * A real integration passes its own assessment-taking component with this
 * same prop shape instead of using this one — see TRUTH_TABLE.md.
 */
export function DefaultSimulationRunner({ plan, onSubmitResponse, onComplete }: SimulationRunnerProps) {
  const [index, setIndex] = useState(0);
  const [startedAt, setStartedAt] = useState(() => Date.now());
  const [remainingMs, setRemainingMs] = useState(plan.simulationProfile.questionCount * EXPECTED_MS_PER_QUESTION);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setRemainingMs((ms) => Math.max(0, ms - 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const total = plan.simulationProfile.questionCount;

  async function answer(isCorrect: boolean) {
    setSubmitting(true);
    const timeTakenMs = Date.now() - startedAt;
    await onSubmitResponse({
      questionIndex: index,
      capability: plan.capability,
      difficulty: 'HARD',
      novelty: plan.novelty,
      isCorrect,
      timeTakenMs,
      expectedTimeMs: EXPECTED_MS_PER_QUESTION,
    });
    setSubmitting(false);
    if (index + 1 >= total) {
      await onComplete();
    } else {
      setIndex((i) => i + 1);
      setStartedAt(Date.now());
    }
  }

  const minutes = Math.floor(remainingMs / 60000);
  const seconds = Math.floor((remainingMs % 60000) / 1000);

  return (
    <section className="proof-root" style={{ background: 'var(--proof-paper-raised)', border: '1px solid var(--proof-line)', borderRadius: 'var(--proof-radius)', padding: '28px 32px', maxWidth: 560 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
        <span className="proof-numeric" style={{ color: 'var(--proof-ink-soft)' }}>
          {`Question ${index + 1} of ${total}`}
        </span>
        <span className="proof-numeric" style={{ color: 'var(--proof-ink-soft)' }}>
          {minutes}:{seconds.toString().padStart(2, '0')}
        </span>
      </div>

      <p style={{ color: 'var(--proof-ink-soft)', fontStyle: 'italic', margin: '0 0 24px' }}>
        [Placeholder question content — a real integration renders its existing question UI here]
      </p>

      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="button" disabled={submitting} onClick={() => answer(true)}
          style={{ background: 'var(--proof-ink)', color: 'var(--proof-paper-raised)', border: 'none', borderRadius: 'var(--proof-radius)', padding: '10px 18px', cursor: 'pointer' }}
        >
          Mark correct (demo)
        </button>
        <button
          type="button" disabled={submitting} onClick={() => answer(false)}
          style={{ background: 'none', color: 'var(--proof-ink-soft)', border: '1px solid var(--proof-line)', borderRadius: 'var(--proof-radius)', padding: '10px 18px', cursor: 'pointer' }}
        >
          Mark incorrect (demo)
        </button>
      </div>
    </section>
  );
}
