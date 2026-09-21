import type { SolvingPathStepView } from '../api/types.js';
import './SolvingPath.css';

const STEP_TYPE_ICON: Record<string, string> = {
  UNDERSTAND: '?',
  IDENTIFY: '=',
  CLASSIFY: '#',
  SELECT: '△',
  DECOMPOSE: '÷',
  FORMULATE: 'ƒ',
  CALCULATE: '∑',
  COMPARE: '⇄',
  ELIMINATE: '⊘',
  REASON: '∴',
  VERIFY: '✓?',
  REFLECT: '↺',
};

function nodeContent(step: SolvingPathStepView): string {
  if (step.status === 'COMPLETED') return '✓';
  if (step.status === 'SKIPPED') return '–';
  return String(step.sequence);
}

function statusText(step: SolvingPathStepView): string {
  switch (step.status) {
    case 'COMPLETED':
      return 'completed';
    case 'SKIPPED':
      return 'skipped';
    case 'CURRENT':
      if (step.classification === 'FIRST_ERROR') return 'current - this is where the first issue appeared';
      if (step.classification === 'INDEPENDENT_ERROR') return 'current - needs another look';
      if (step.classification === 'AFFECTED_BY_PRIOR_ERROR') return 'current - affected by an earlier step';
      return 'current step';
    default:
      return 'upcoming';
  }
}

export function SolvingPath({ steps }: { steps: SolvingPathStepView[] }) {
  return (
    <ol className="solving-rail" aria-label="Solving path">
      {steps.map((step) => {
        const tone =
          step.classification === 'FIRST_ERROR'
            ? 'first-error'
            : step.classification === 'INDEPENDENT_ERROR'
              ? 'error'
              : step.classification === 'AFFECTED_BY_PRIOR_ERROR'
                ? 'carried'
                : step.status.toLowerCase();

        return (
          <li key={step.stepId} className={`rail-step rail-step--${tone}`}>
            <span className="rail-node" title={STEP_TYPE_ICON[step.type] ?? ''} aria-hidden="true">
              {nodeContent(step)}
            </span>
            <span className="rail-label">
              {step.objective}
              {step.classification === 'FIRST_ERROR' && <span className="rail-tag rail-tag--first-error">First issue here</span>}
              {step.classification === 'AFFECTED_BY_PRIOR_ERROR' && (
                <span className="rail-tag rail-tag--carried">Carried from above</span>
              )}
              {step.classification === 'INDEPENDENT_ERROR' && <span className="rail-tag rail-tag--error">Needs another look</span>}
            </span>
            <span className="visually-hidden">
              {' '}
              Step {step.sequence} of {steps.length}: {statusText(step)}.
            </span>
          </li>
        );
      })}
    </ol>
  );
}
