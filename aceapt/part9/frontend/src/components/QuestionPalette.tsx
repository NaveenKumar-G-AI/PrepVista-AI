import { QuestionLocalState } from '../types';

interface Props {
  states: QuestionLocalState[];
  currentIndex: number;
  onNavigate: (index: number) => void;
}

const STATE_CLASSES: Record<QuestionLocalState, string> = {
  answered: 'bg-moss text-bone border-moss',
  skipped: 'border-brass text-brass border-dashed',
  untouched: 'border-inkline text-slate',
};

export function QuestionPalette({ states, currentIndex, onNavigate }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {states.map((state, i) => (
        <button
          key={i}
          onClick={() => onNavigate(i)}
          aria-label={`Question ${i + 1}, ${state}${i === currentIndex ? ', current' : ''}`}
          className={`readout flex h-8 w-8 items-center justify-center rounded-md border text-xs transition-colors
            ${STATE_CLASSES[state]}
            ${i === currentIndex ? 'ring-2 ring-brasslight ring-offset-2 ring-offset-ink' : ''}
          `}
        >
          {i + 1}
        </button>
      ))}
    </div>
  );
}
