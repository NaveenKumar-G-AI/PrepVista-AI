import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { fmtPct } from "../lib/format";
import type { Explanation, ReadinessSnapshot, SimulationPostmortem } from "../lib/types";
import { StateBadge } from "../components/readiness/Badges";

export default function ResultPage() {
  const { id } = useParams<{ id: string }>();
  const [pm, setPm] = useState<{ postmortem: SimulationPostmortem; explanation: Explanation } | null>(null);
  const [readiness, setReadiness] = useState<ReadinessSnapshot | null>(null);

  useEffect(() => {
    if (!id) return;
    api.get<{ postmortem: SimulationPostmortem; explanation: Explanation }>(`/simulations/${id}/postmortem`).then(setPm);
    api.get<{ readiness: ReadinessSnapshot }>("/readiness").then((d) => setReadiness(d.readiness));
  }, [id]);

  if (!pm) {
    return <div className="text-center text-paper-500 py-24 text-sm">Scoring…</div>;
  }

  const { postmortem } = pm;
  const strong: string[] = [];
  const needsAttention: string[] = [];

  if (postmortem.recovery.postErrorRecoveryRate !== null && postmortem.recovery.postErrorRecoveryRate >= 70) strong.push("Recovery after mistakes");
  if (!postmortem.topicSwitching.hasGap) strong.push("Topic-switching stability");
  if (!postmortem.degradation.hasDegradation) strong.push("Held pace to the end");
  if (postmortem.questionSelection.score >= 75) strong.push("Solve / skip / return decisions");

  if (postmortem.timeAllocation.sinkObservations.length > 0) needsAttention.push("Time allocation");
  if (postmortem.topicSwitching.hasGap) needsAttention.push("Mixed-topic switching");
  if (postmortem.degradation.hasDegradation) needsAttention.push("Final-section performance");
  if (postmortem.unansweredCount > 0) needsAttention.push(`${postmortem.unansweredCount} unanswered question${postmortem.unansweredCount === 1 ? "" : "s"}`);

  return (
    <div className="max-w-2xl mx-auto text-center">
      <div className="label-caps mb-2">Assessment Complete</div>
      <div className="data-figure text-5xl font-semibold text-paper-100 mb-1">{fmtPct(postmortem.accuracyPct)}</div>
      <div className="text-sm text-paper-500 mb-8">
        {postmortem.score}/{postmortem.maxScore} marks
      </div>

      {readiness && (
        <div className="panel p-5 mb-6 inline-flex items-center gap-4 text-left">
          <div>
            <div className="label-caps mb-1">Assessment readiness</div>
            <div className="data-figure text-2xl text-paper-100">{readiness.overallScore.toFixed(0)}%</div>
          </div>
          <div className="w-px h-10 bg-ink-600" />
          <StateBadge state={readiness.overallState} />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 text-left mb-8">
        <div className="panel p-5">
          <div className="label-caps text-signal-ready mb-3">Strong</div>
          {strong.length > 0 ? (
            <ul className="space-y-1.5 text-sm text-paper-300">
              {strong.map((s) => (
                <li key={s}>✓ {s}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-paper-500">Nothing stood out yet — more evidence needed.</p>
          )}
        </div>
        <div className="panel p-5">
          <div className="label-caps text-signal-developing mb-3">Needs attention</div>
          {needsAttention.length > 0 ? (
            <ul className="space-y-1.5 text-sm text-paper-300">
              {needsAttention.map((s) => (
                <li key={s}>! {s}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-paper-500">No major issues detected.</p>
          )}
        </div>
      </div>

      <div className="flex gap-3 justify-center">
        <Link to="/" className="rounded-lg border border-ink-600 text-paper-300 text-sm px-5 py-2.5 hover:border-ink-500">
          Back to readiness
        </Link>
        <Link
          to={`/simulations/${id}/postmortem`}
          className="rounded-lg bg-signal-ready text-ink-950 font-medium text-sm px-5 py-2.5 hover:bg-signal-ready/90"
        >
          View postmortem
        </Link>
      </div>
    </div>
  );
}
