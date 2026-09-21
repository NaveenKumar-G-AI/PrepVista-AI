import React from 'react';
import { AttemptFeedback } from '../types/speed';

export interface SpeedFeedbackProps {
  feedback: AttemptFeedback;
  correct: boolean;
  coachingNote?: string | null;
}

/** Spec 54, 73, 92: deterministic status + detail line, plus an optional
 * (already tone-checked) coaching note only on notable transitions. */
export function SpeedFeedback({ feedback, correct, coachingNote }: SpeedFeedbackProps) {
  const tone = correct ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-slate-50 text-slate-800';

  return (
    <div className={`rounded-lg border p-3 ${tone}`} role="status">
      <div className="flex items-center gap-2">
        <span className="text-lg leading-none" aria-hidden="true">
          {correct ? '✓' : '·'}
        </span>
        <p className="text-sm font-medium">{feedback.status}</p>
      </div>
      <p className="mt-0.5 pl-6 text-sm opacity-80">{feedback.detail}</p>
      {coachingNote && <p className="mt-2 border-t border-current/10 pt-2 text-sm italic opacity-90">{coachingNote}</p>}
    </div>
  );
}

export default SpeedFeedback;
