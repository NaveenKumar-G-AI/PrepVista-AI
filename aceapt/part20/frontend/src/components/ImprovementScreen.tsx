import { useEffect, useState } from "react";
import { ArrowRight, RotateCcw, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { api } from "../lib/api";
import type { SessionEvidence } from "../lib/types";

interface Props {
  drillSessionId: string;
  onNewMock: () => void;
}

export default function ImprovementScreen({ drillSessionId, onNewMock }: Props) {
  const [data, setData] = useState<{ drillLabel: string; drillEvidence: SessionEvidence; mainEvidence: SessionEvidence } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getImprovement(drillSessionId)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load the comparison."));
  }, [drillSessionId]);

  if (error) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700">{error}</div>;
  if (!data) return <div className="py-24 text-center text-slate-400">Comparing your results…</div>;

  const { drillLabel, drillEvidence, mainEvidence } = data;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="text-center">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{drillLabel} — Results</div>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Your Improvement</h1>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <CompareRow
          label="Accuracy"
          before={`${mainEvidence.accuracyPct}%`}
          after={`${drillEvidence.accuracyPct}%`}
          delta={drillEvidence.accuracyPct - mainEvidence.accuracyPct}
        />
        <CompareRow
          label="Avg. Time per Question"
          before={`${Math.round(mainEvidence.avgTimePerQuestionSec)}s`}
          after={`${Math.round(drillEvidence.avgTimePerQuestionSec)}s`}
          delta={Math.round(mainEvidence.avgTimePerQuestionSec) - Math.round(drillEvidence.avgTimePerQuestionSec)}
          lowerIsBetter
        />
        <CompareRow
          label="Question Selection"
          before={mainEvidence.selectionQuality}
          after={drillEvidence.selectionQuality}
          isText
        />
      </div>

      <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
        One short drill isn't proof of lasting mastery — but it shows the direction. Run a few more focused sessions
        to build this into a habit.
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          onClick={onNewMock}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700"
        >
          Run Another Full Mock <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

function CompareRow({
  label,
  before,
  after,
  delta,
  lowerIsBetter,
  isText,
}: {
  label: string;
  before: string;
  after: string;
  delta?: number;
  lowerIsBetter?: boolean;
  isText?: boolean;
}) {
  let trend: "up" | "down" | "flat" = "flat";
  if (delta !== undefined) {
    const improved = lowerIsBetter ? delta > 0 : delta > 0;
    if (delta === 0) trend = "flat";
    else trend = improved ? "up" : "down";
  }
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-4 last:border-0">
      <span className="text-sm font-medium text-slate-600">{label}</span>
      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-400">{before}</span>
        <ArrowRight size={14} className="text-slate-300" />
        <span className="font-semibold text-slate-900">{after}</span>
        {!isText && trend === "up" && <TrendingUp size={16} className="text-emerald-500" />}
        {!isText && trend === "down" && <TrendingDown size={16} className="text-rose-500" />}
        {!isText && trend === "flat" && <Minus size={16} className="text-slate-300" />}
      </div>
    </div>
  );
}
