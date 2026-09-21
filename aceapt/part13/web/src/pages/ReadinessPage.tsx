import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { fmtPct } from "../lib/format";
import type { Explanation, ReadinessSnapshot, TrendPoint } from "../lib/types";
import { ReadinessInstrument } from "../components/readiness/ReadinessInstrument";
import { ReadinessJourneyChart } from "../components/readiness/ReadinessJourneyChart";
import { ConfidenceBadge, StateBadge } from "../components/readiness/Badges";
import { GapList } from "../components/readiness/GapList";
import { StartSimulationPanel } from "../components/readiness/StartSimulationPanel";

export default function ReadinessPage() {
  const [data, setData] = useState<{ readiness: ReadinessSnapshot; explanation: Explanation } | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [showStart, setShowStart] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<{ readiness: ReadinessSnapshot; explanation: Explanation }>("/readiness"),
      api.get<{ trend: TrendPoint[] }>("/readiness/trend"),
    ])
      .then(([r, t]) => {
        setData(r);
        setTrend(t.trend);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load readiness"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-center text-paper-500 py-24 text-sm">Loading readiness…</div>;
  }
  if (error || !data) {
    return <div className="text-center text-signal-risk py-24 text-sm">{error ?? "No data"}</div>;
  }

  const { readiness, explanation } = data;
  const sortedDims = [...readiness.dimensions].sort((a, b) => a.score - b.score);
  const strongest = [...readiness.dimensions].filter((d) => d.status === "READY").sort((a, b) => b.score - a.score)[0];

  return (
    <div className="pb-16">
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <div className="label-caps mb-2">Your Assessment Readiness</div>
          <div className="flex items-baseline gap-4">
            <span className="data-figure text-6xl font-semibold text-paper-100 leading-none">
              {readiness.overallScore.toFixed(0)}
              <span className="text-2xl text-paper-500">%</span>
            </span>
            <div className="flex flex-col gap-1">
              <StateBadge state={readiness.overallState} />
              <ConfidenceBadge level={readiness.confidence.level} />
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowStart(true)}
          className="rounded-lg bg-signal-ready text-ink-950 font-medium text-sm px-5 py-2.5 hover:bg-signal-ready/90 transition-colors"
        >
          Start a simulation
        </button>
      </div>

      {readiness.evidenceCount === 0 ? (
        <div className="panel p-10 text-center">
          <p className="text-paper-300 mb-1">No realistic simulation on record yet.</p>
          <p className="text-sm text-paper-500">Readiness can't be assessed from practice accuracy alone — start a simulation to build evidence.</p>
        </div>
      ) : (
        <>
          <div className="grid lg:grid-cols-5 gap-6 mb-6">
            <div className="lg:col-span-3 panel p-6">
              <div className="label-caps mb-4">Readiness Dimensions</div>
              <ReadinessInstrument dimensions={readiness.dimensions} />
            </div>

            <div className="lg:col-span-2 flex flex-col gap-6">
              <div className="panel p-5">
                <div className="label-caps mb-3">Why am I not ready?</div>
                <p className="text-sm text-paper-300 leading-relaxed whitespace-pre-line">{explanation.text}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="panel p-4">
                  <div className="label-caps mb-1.5">Strongest</div>
                  {strongest ? (
                    <>
                      <div className="text-sm font-medium text-paper-100">{strongest.dimensionKey.replace(/_/g, " ")}</div>
                      <div className="data-figure text-signal-ready text-lg">{fmtPct(strongest.score)}</div>
                    </>
                  ) : (
                    <div className="text-sm text-paper-500">None yet</div>
                  )}
                </div>
                <div className="panel p-4">
                  <div className="label-caps mb-1.5">Biggest gap</div>
                  {sortedDims[0] ? (
                    <>
                      <div className="text-sm font-medium text-paper-100">{sortedDims[0].dimensionKey.replace(/_/g, " ")}</div>
                      <div className="data-figure text-signal-risk text-lg">{fmtPct(sortedDims[0].score)}</div>
                    </>
                  ) : (
                    <div className="text-sm text-paper-500">—</div>
                  )}
                </div>
              </div>

              <div className="panel p-5">
                <div className="label-caps mb-1">Evidence</div>
                <p className="text-sm text-paper-300">
                  {readiness.evidenceCount} realistic simulation{readiness.evidenceCount === 1 ? "" : "s"}
                </p>
                {readiness.confidence.limitingFactors.length > 0 && (
                  <p className="text-xs text-paper-500 mt-1.5">{readiness.confidence.limitingFactors[0]}</p>
                )}
              </div>
            </div>
          </div>

          <div className="panel p-6 mb-6">
            <div className="label-caps mb-1">What's holding you back</div>
            <GapList gaps={readiness.gaps} />
          </div>

          <div className="panel p-6">
            <div className="label-caps mb-4">Readiness Journey</div>
            <ReadinessJourneyChart trend={trend} />
          </div>
        </>
      )}

      {showStart && <StartSimulationPanel onClose={() => setShowStart(false)} />}
    </div>
  );
}
