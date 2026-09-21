import { Zap, Clock, Play } from "lucide-react";
import type { DrillChoice } from "../lib/types";

interface Props {
  drillChoice: DrillChoice;
  questionCount: number;
  durationSec: number;
  onBegin: () => void;
  starting: boolean;
}

export default function DrillIntroScreen({ drillChoice, questionCount, durationSec, onBegin, starting }: Props) {
  return (
    <div className="mx-auto max-w-xl">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500 text-white">
          <Zap size={22} />
        </div>
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">What To Do Next</div>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{drillChoice.label}</h1>
        <p className="mx-auto mt-3 max-w-sm text-slate-500">{drillChoice.reason}</p>

        <div className="mx-auto mt-6 flex max-w-xs justify-center gap-4 text-sm text-slate-600">
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-2">
            <Zap size={14} /> {questionCount} questions
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-2">
            <Clock size={14} /> {Math.round(durationSec / 60)} minutes
          </span>
        </div>

        <button
          onClick={onBegin}
          disabled={starting}
          className="mt-8 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-8 py-3 font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-60"
        >
          <Play size={18} />
          {starting ? "Starting…" : "Begin Drill"}
        </button>
      </div>
    </div>
  );
}
