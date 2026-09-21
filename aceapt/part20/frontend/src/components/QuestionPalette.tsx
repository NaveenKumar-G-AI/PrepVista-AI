import type { ClientQuestion, ResponseState } from "../lib/types";

interface Props {
  questions: ClientQuestion[];
  responses: Record<string, ResponseState>;
  currentIndex: number;
  onJump: (index: number) => void;
}

export default function QuestionPalette({ questions, responses, currentIndex, onJump }: Props) {
  return (
    <div>
      <div className="grid grid-cols-5 gap-2">
        {questions.map((q, i) => {
          const r = responses[q.id];
          let cls = "bg-white border-slate-300 text-slate-500 hover:border-slate-400";
          if (r?.status === "answered") cls = "bg-emerald-500 border-emerald-500 text-white";
          else if (r?.status === "viewed") cls = "bg-slate-200 border-slate-300 text-slate-700";
          if (r?.markedForReview) {
            cls =
              r?.status === "answered"
                ? "bg-violet-500 border-violet-500 text-white"
                : "bg-amber-400 border-amber-400 text-white";
          }
          const ring = i === currentIndex ? "ring-2 ring-offset-2 ring-indigo-600" : "";
          return (
            <button
              key={q.id}
              onClick={() => onJump(i)}
              className={`h-10 rounded-lg border text-sm font-semibold transition ${cls} ${ring}`}
              aria-label={`Go to question ${i + 1}`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <div className="mt-4 space-y-1.5 text-xs text-slate-500">
        <LegendRow swatch="bg-emerald-500" label="Answered" />
        <LegendRow swatch="bg-slate-200 border border-slate-300" label="Viewed, not answered" />
        <LegendRow swatch="bg-amber-400" label="Marked for review" />
        <LegendRow swatch="bg-white border border-slate-300" label="Not visited" />
      </div>
    </div>
  );
}

function LegendRow({ swatch, label }: { swatch: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-block h-3 w-3 rounded ${swatch}`} />
      <span>{label}</span>
    </div>
  );
}
