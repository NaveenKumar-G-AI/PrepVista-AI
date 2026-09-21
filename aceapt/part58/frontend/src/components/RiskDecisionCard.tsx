import { useState } from 'react';
import type { RiskPolicyDisplay } from '../types';
import './RiskDecisionCard.css';

/** §81, §144: shows the ACTUAL configured scoring values — never invented
 *  ones — and asks attempt vs skip. This is training/practice only; a real
 *  formal assessment never surfaces a recommendation alongside this. */
export interface RiskDecisionCardProps {
  policy: RiskPolicyDisplay;
  onChoose?: (choice: 'ATTEMPT' | 'SKIP') => void;
}

function formatSigned(value: number): string {
  if (value === 0) return '0';
  return value > 0 ? `+${value}` : `${value}`;
}

export default function RiskDecisionCard({
  policy = { correctReward: 1, wrongPenalty: -0.25, blankValue: 0 },
  onChoose,
}: Partial<RiskDecisionCardProps>) {
  const [choice, setChoice] = useState<'ATTEMPT' | 'SKIP' | null>(null);

  function handleChoose(next: 'ATTEMPT' | 'SKIP') {
    setChoice(next);
    onChoose?.(next);
  }

  return (
    <div className="f58-root f58-risk">
      <h3 className="f58-title f58-risk__title">Scoring for this question</h3>
      <dl className="f58-risk__ledger">
        <div className="f58-risk__row">
          <dt>Correct</dt>
          <dd className="f58-numeral f58-risk__value f58-risk__value--good">{formatSigned(policy.correctReward)}</dd>
        </div>
        <div className="f58-risk__row">
          <dt>Wrong</dt>
          <dd className="f58-numeral f58-risk__value f58-risk__value--bad">{formatSigned(policy.wrongPenalty)}</dd>
        </div>
        <div className="f58-risk__row">
          <dt>Blank</dt>
          <dd className="f58-numeral f58-risk__value">{formatSigned(policy.blankValue)}</dd>
        </div>
      </dl>

      <p className="f58-risk__question">Attempt this question, or leave it blank?</p>
      <div className="f58-risk__actions">
        <button
          type="button"
          className="f58-btn f58-btn--primary"
          aria-pressed={choice === 'ATTEMPT'}
          onClick={() => handleChoose('ATTEMPT')}
        >
          Attempt
        </button>
        <button type="button" className="f58-btn" aria-pressed={choice === 'SKIP'} onClick={() => handleChoose('SKIP')}>
          Leave blank
        </button>
      </div>
    </div>
  );
}
