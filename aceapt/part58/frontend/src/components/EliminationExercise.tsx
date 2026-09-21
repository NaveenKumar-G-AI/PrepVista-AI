import { useState } from 'react';
import type { ScenarioOption } from '../types';
import './EliminationExercise.css';

/** §25, §79: mark options that cannot be correct, then decide whether to
 *  answer or skip. Eliminations recorded here are SELF_REPORTED evidence
 *  (see OptionEliminationService) unless a real verifier confirms them. */
export interface EliminationExerciseProps {
  prompt: string;
  options: ScenarioOption[];
  onProceed?: (eliminatedIds: string[], next: 'ATTEMPT' | 'SKIP') => void;
}

const DEFAULT_OPTIONS: ScenarioOption[] = [
  { id: 'A', label: '12.4 m/s' },
  { id: 'B', label: '3.1 kg' },
  { id: 'C', label: '18.9 m/s' },
  { id: 'D', label: '-4.2 m/s' },
];

export default function EliminationExercise({
  prompt = 'Which options can you rule out before attempting this?',
  options = DEFAULT_OPTIONS,
  onProceed,
}: Partial<EliminationExerciseProps>) {
  const [eliminated, setEliminated] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setEliminated((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const remaining = options.length - eliminated.size;

  return (
    <div className="f58-root f58-elim">
      <p className="f58-elim__prompt">{prompt}</p>
      <ul className="f58-elim__list">
        {options.map((option) => {
          const isOut = eliminated.has(option.id);
          return (
            <li key={option.id}>
              <button
                type="button"
                className={`f58-elim__option${isOut ? ' f58-elim__option--out' : ''}`}
                aria-pressed={isOut}
                onClick={() => toggle(option.id)}
              >
                <span className="f58-numeral f58-elim__option-id">{option.id}</span>
                <span className="f58-elim__option-label">{option.label}</span>
                <span className="f58-elim__mark" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>

      <div className="f58-elim__footer">
        <span className="f58-elim__count">
          {remaining} of {options.length} left
        </span>
        <div className="f58-elim__actions">
          <button type="button" className="f58-btn f58-btn--primary" onClick={() => onProceed?.([...eliminated], 'ATTEMPT')}>
            Attempt
          </button>
          <button type="button" className="f58-btn" onClick={() => onProceed?.([...eliminated], 'SKIP')}>
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
