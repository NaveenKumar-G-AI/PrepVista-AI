import type { LastAttemptFeedback } from '../state/useGuidedSession.js';
import './FeedbackBanner.css';

/**
 * Section 52-53: never "Wrong." - concise, respectful language that isolates
 * the part of the step to look at again, and Section 17: distinct copy per
 * result state rather than a single generic failure message.
 */
const COPY: Record<LastAttemptFeedback['result'], { tone: 'good' | 'close' | 'retry'; headline: string }> = {
  CORRECT: { tone: 'good', headline: 'Correct.' },
  PARTIALLY_CORRECT: { tone: 'close', headline: "You're close - let's refine it." },
  INCORRECT: { tone: 'retry', headline: "That's not quite it yet. Let's isolate the step." },
  FORMAT_ERROR: { tone: 'retry', headline: "Let's fix the format before checking the value." },
  UNIT_ERROR: { tone: 'close', headline: 'The number looks right - check the unit.' },
  INCOMPLETE: { tone: 'retry', headline: 'Enter a value before submitting.' },
  UNKNOWN: { tone: 'retry', headline: "Let's take another look at this step." },
};

export function FeedbackBanner({ feedback }: { feedback: LastAttemptFeedback }) {
  const copy = COPY[feedback.result];
  return (
    <div className={`feedback-banner feedback-banner--${copy.tone}`} role="status" aria-live="polite">
      <p className="feedback-banner__headline">{copy.headline}</p>
      {feedback.detail && <p className="feedback-banner__detail">{feedback.detail}</p>}
    </div>
  );
}
