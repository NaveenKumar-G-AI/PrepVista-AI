import type { ClientQuestion, ResponseState } from "../lib/types";

interface Props {
  question: ClientQuestion;
  total: number;
  response: ResponseState | undefined;
  onSelect: (index: number) => void;
}

export default function QuestionCard({ question, total, response, onSelect }: Props) {
  return (
    <div>
      <div className="mb-3 text-xs font-semibold tracking-wide text-slate-400">
        QUESTION {question.sequenceIndex + 1} OF {total}
      </div>
      <p className="mb-6 text-lg leading-relaxed text-slate-900">{question.prompt}</p>
      <div className="space-y-3">
        {question.options.map((opt, i) => {
          const selected = response?.selectedIndex === i;
          return (
            <button
              key={i}
              onClick={() => onSelect(i)}
              className={`w-full rounded-xl border-2 px-4 py-3 text-left transition ${
                selected
                  ? "border-indigo-600 bg-indigo-50 text-indigo-900"
                  : "border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <span
                className={`mr-3 inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                  selected ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"
                }`}
              >
                {String.fromCharCode(65 + i)}
              </span>
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}
