import { useState } from 'react';
import type { CurrentStepView, GuidanceView, NextStepPreview } from '../api/types.js';
import type { LastAttemptFeedback } from '../state/useGuidedSession.js';
import { AnswerInput } from './AnswerInput.js';
import { FeedbackBanner } from './FeedbackBanner.js';
import { GuidancePanel } from './GuidancePanel.js';
import './CurrentStepCard.css';

export function CurrentStepCard({
  step,
  lastAttempt,
  guidance,
  nextStepPreview,
  loading,
  onSubmit,
  onRetry,
  onSkip,
}: {
  step: CurrentStepView;
  lastAttempt: LastAttemptFeedback | null;
  guidance: GuidanceView | null;
  nextStepPreview: NextStepPreview | null;
  loading: boolean;
  onSubmit: (rawInput: string) => void;
  onRetry: () => void;
  onSkip: () => void;
}) {
  const [attemptGeneration, setAttemptGeneration] = useState(0);
  const showRetry = lastAttempt && lastAttempt.result !== 'CORRECT' && lastAttempt.result !== 'INCOMPLETE';

  return (
    <section className="current-step-card" aria-label={`Step ${step.sequence} of ${step.totalSteps}`}>
      <p className="current-step-card__eyebrow">
        Step {step.sequence} of {step.totalSteps} · {step.type.replace(/_/g, ' ')}
      </p>
      <h2 className="current-step-card__prompt">{step.prompt}</h2>

      <AnswerInput key={`${step.stepId}-${attemptGeneration}`} step={step} onSubmit={onSubmit} disabled={loading} />

      {lastAttempt && <FeedbackBanner feedback={lastAttempt} />}
      <GuidancePanel guidance={guidance} nextStepPreview={nextStepPreview} />

      {showRetry && (
        <div className="current-step-card__secondary">
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setAttemptGeneration((g) => g + 1);
              onRetry();
            }}
            disabled={loading}
          >
            Try again
          </button>
          <button type="button" className="link-button link-button--quiet" onClick={onSkip} disabled={loading}>
            Skip this step
          </button>
        </div>
      )}
    </section>
  );
}
