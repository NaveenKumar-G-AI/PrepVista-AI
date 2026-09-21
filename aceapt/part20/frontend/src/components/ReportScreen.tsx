import { useEffect, useState } from "react";
import { Sparkles, Trophy, Target, Zap, TrendingDown, Brain, SkipForward, ArrowRight, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "../lib/api";
import type { ReportResponse } from "../lib/types";
import { DifficultyBadge, DecisionBadge, SelectionBadge } from "./Badges";
import SegmentChart from "./SegmentChart";
import { formatDuration } from "../lib/format";

interface Props {
  sessionId: string;
  onStartDrill: () => void;
  onNewMock: () => void;
}

const COACH_PROMPTS: { key: string; label: string; icon: LucideIcon }[] = [
  { key: "analyze", label: "Analyze My Test", icon: Brain },
  { key: "time", label: "Why Did I Lose Time?", icon: TrendingDown },
  { key: "skip", label: "Which Should I Have Skipped?", icon: SkipForward },
  { key: "drop", label: "Where Did I Drop Off?", icon: TrendingDown },
];

export default function ReportScreen({ sessionId, onStartDrill, onNewMock }: Props) {
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coachKey, setCoachKey] = useState<string | null>(null);
  const [coachAnswers, setCoachAnswers] = useState<Record<string, { text: string; loading: boolean }>>({});
  const [reviewOpen, setReviewOpen] = useState(false);

  useEffect(() => {
    api
      .getReport(sessionId)
      .then(setReport)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load report."));
  }, [sessionId]);

  async function askCoach(key: string, label: string) {
    setCoachKey(key);
    if (coachAnswers[key]) return;
    setCoachAnswers((prev) => ({ ...prev, [key]: { text: "", loading: true } }));
    try {
      const result = await api.coach(sessionId, key);
      setCoachAnswers((prev) => ({ ...prev, [key]: { text: result.text, loading: false } }));
    } catch {
      setCoachAnswers((prev) => ({
        ...prev,
        [key]: { text: `Couldn't reach the coach for "${label}" — try again in a moment.`, loading: false },
      }));
    }
  }

  if (error) return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700">{error}</div>;
  if (!report) return <div className="py-24 text-center text-slate-400">Loading your report…</div>;

  const { evidence: ev, narrative, questionReview } = report;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Performance Intelligence</div>
            <div className="mt-1 flex items-baseline gap-2">
              <Trophy size={22} className="text-indigo-600" />
              <span className="text-3xl font-bold text-slate-900">
                {ev.score} <span className="text-lg font-medium text-slate-400">/ {ev.maxScore}</span>
              </span>
            </div>
          </div>
          <SelectionBadge quality={ev.selectionQuality} />
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric icon={<Target size={15} />} label="Accuracy" value={`${ev.accuracyPct}%`} />
          <Metric icon={<Zap size={15} />} label="Attempted" value={`${ev.attemptRatePct}%`} />
          <Metric label="Speed / Accuracy" value={ev.speedAccuracyProfile} small />
          <Metric label="Recovery" value={ev.recoveryRatePct != null ? `${ev.recoveryRatePct}%` : "—"} />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Sparkles size={16} className="text-indigo-500" /> Your Test Story
        </div>
        <p className="leading-relaxed text-slate-600">{narrative.text}</p>
        {narrative.source && (
          <div className="mt-3 text-xs text-slate-300">
            {narrative.source === "ai" ? "AI-generated analysis, grounded in your test data." : "Generated from your test data."}
          </div>
        )}
      </div>

      {ev.biggestLeak.type !== "none" && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <div className="mb-1 text-sm font-semibold text-amber-800">Why You Lost Marks</div>
          <p className="text-amber-900">{ev.biggestLeak.text}</p>
          {ev.opportunityCostEquivalentQuestions > 0 && (
            <p className="mt-2 text-sm text-amber-700">
              Estimate: at your average pace, that's roughly <strong>{ev.opportunityCostEquivalentQuestions}</strong> extra
              questions you could have attempted instead.
            </p>
          )}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-3 text-sm font-semibold text-slate-700">Performance Across the Test</div>
        <SegmentChart segments={ev.segments} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <button
          onClick={() => setReviewOpen((o) => !o)}
          className="flex w-full items-center justify-between text-sm font-semibold text-slate-700"
        >
          <span>Question-by-Question Post-Mortem</span>
          {reviewOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {reviewOpen && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-400">
                  <th className="py-2 pr-4">#</th>
                  <th className="py-2 pr-4">Concept</th>
                  <th className="py-2 pr-4">Difficulty</th>
                  <th className="py-2 pr-4">Time</th>
                  <th className="py-2 pr-4">Result</th>
                  <th className="py-2">Decision</th>
                </tr>
              </thead>
              <tbody>
                {ev.perQuestion.map((p) => {
                  const review = questionReview.find((q) => q.sequenceIndex === p.sequenceIndex);
                  return (
                    <tr key={p.questionId} className="border-b border-slate-100 align-top">
                      <td className="py-2.5 pr-4 font-medium text-slate-700">{p.sequenceIndex + 1}</td>
                      <td className="py-2.5 pr-4 text-slate-600">{p.concept}</td>
                      <td className="py-2.5 pr-4">
                        <DifficultyBadge level={p.difficulty} />
                      </td>
                      <td className="py-2.5 pr-4 font-mono text-slate-500">{formatDuration(p.timeSec)}</td>
                      <td className="py-2.5 pr-4">
                        {p.status === "correct" && <span className="font-medium text-emerald-600">Correct</span>}
                        {p.status === "wrong" && <span className="font-medium text-rose-600">Wrong</span>}
                        {p.status === "unattempted" && <span className="text-slate-300">—</span>}
                      </td>
                      <td className="py-2.5">
                        <DecisionBadge label={p.decision} />
                        {review && review.yourIndex == null && (
                          <div className="mt-1 text-xs text-slate-400">Correct: {review.options[review.correctIndex]}</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-3 text-sm font-semibold text-slate-700">Ask the Coach</div>
        <div className="flex flex-wrap gap-2">
          {COACH_PROMPTS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => askCoach(key, label)}
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-medium transition ${
                coachKey === key ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-slate-300 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
        {coachKey && (
          <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
            {coachAnswers[coachKey]?.loading ? <span className="text-slate-400">Thinking…</span> : coachAnswers[coachKey]?.text}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          onClick={onStartDrill}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white hover:bg-indigo-700"
        >
          Run Targeted Drill <ArrowRight size={16} />
        </button>
        <button
          onClick={onNewMock}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-5 py-3 font-semibold text-slate-600 hover:bg-slate-50"
        >
          <RotateCcw size={16} /> Start a New Mock
        </button>
      </div>
    </div>
  );
}

function Metric({ icon, label, value, small }: { icon?: React.ReactNode; label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="flex items-center gap-1.5 text-xs text-slate-400">
        {icon}
        {label}
      </div>
      <div className={`mt-1 font-semibold text-slate-800 ${small ? "text-sm" : "text-lg"}`}>{value}</div>
    </div>
  );
}
