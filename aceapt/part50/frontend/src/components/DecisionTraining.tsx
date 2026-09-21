import React from 'react';
import { AttemptDecision } from '../types/speed';

export interface DecisionTrainingProps {
  recommendation: AttemptDecision;
  rationale: string;
  onChoose: (decision: AttemptDecision) => void;
}

const OPTIONS: { value: AttemptDecision; label: string }[] = [
  { value: 'ATTEMPT', label: 'Attempt now' },
  { value: 'SKIP', label: 'Skip' },
  { value: 'RETURN_LATER', label: 'Flag & return later' },
];

/** Spec 38, 59-61: shows a recommendation + plain-language reasoning, never
 * a raw numeric "value" score. The student always makes the final call. */
export function DecisionTraining({ recommendation, rationale, onChoose }: DecisionTrainingProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Attempt or skip?</p>
      <p className="mt-2 text-sm text-slate-600">{rationale}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {OPTIONS.map((opt) => {
          const isRecommended = opt.value === recommendation;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChoose(opt.value)}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium transition ${
                isRecommended
                  ? 'border-slate-900 bg-slate-900 text-white hover:bg-slate-700'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              {opt.label}
              {isRecommended && <span className="ml-1.5 text-xs opacity-70">(suggested)</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default DecisionTraining;
