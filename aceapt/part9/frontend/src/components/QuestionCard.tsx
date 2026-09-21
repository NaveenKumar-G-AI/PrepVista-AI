import { PublicQuestion } from '../types';

interface Props {
  question: PublicQuestion;
  sequence: number;
  questionCount: number;
  selectedOptionId: string | null;
  onSelect: (optionId: string) => void;
}

export function QuestionCard({ question, sequence, questionCount, selectedOptionId, onSelect }: Props) {
  return (
    <div className="flex-1">
      <p className="readout mb-3 text-xs uppercase tracking-widest text-slate">
        Question {sequence + 1} of {questionCount}
      </p>
      <h2 className="font-display text-2xl leading-snug text-bone md:text-3xl">{question.prompt}</h2>

      <div className="mt-8 grid gap-3 md:grid-cols-2">
        {question.options.map((opt) => {
          const selected = opt.id === selectedOptionId;
          return (
            <button
              key={opt.id}
              onClick={() => onSelect(opt.id)}
              className={`group flex items-center gap-3 rounded-lg border px-5 py-4 text-left transition-colors
                ${selected ? 'border-brass bg-brass/10' : 'border-inkline hover:border-slate'}
              `}
            >
              <span
                className={`readout flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs
                  ${selected ? 'border-brass bg-brass text-ink' : 'border-slate text-slate'}
                `}
              >
                {opt.id.toUpperCase()}
              </span>
              <span className="font-body text-base text-bone">{opt.text}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
