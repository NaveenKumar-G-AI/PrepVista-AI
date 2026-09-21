import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, ApiError, type SkillDetailResponse, type ExplainResponse, type HistoryResponse } from "../api/client";
import { StateBadge, ConfidenceBadge } from "../components/StateBadge";
import { StateTrack } from "../components/StateTrack";
import { CalibrationArc } from "../components/CalibrationArc";
import { HistoryTimeline } from "../components/HistoryTimeline";

const DIMENSION_META = [
  { key: "conceptScore", label: "Concept", threshold: 0.75 },
  { key: "executionScore", label: "Execution", threshold: 0.75 },
  { key: "transferScore", label: "Transfer", threshold: 0.75 },
  { key: "retentionScore", label: "Retention", threshold: 0.70 },
  { key: "timedScore", label: "Timed", threshold: 0.70 },
  { key: "consistencyScore", label: "Consistency", threshold: 0.70 },
] as const;

function toneFor(state: string): "verified" | "provisional" | "caution" | "regressed" | "neutral" {
  if (state === "VERIFIED_MASTERED" || state === "STABLE_MASTERED") return "verified";
  if (state === "AT_RISK") return "caution";
  if (state === "REGRESSED") return "regressed";
  if (state === "UNKNOWN") return "neutral";
  return "provisional";
}

export function SkillDetailPage() {
  const { skillId } = useParams<{ skillId: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<SkillDetailResponse | null>(null);
  const [explain, setExplain] = useState<ExplainResponse | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [showRationale, setShowRationale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!skillId) return;
    Promise.all([api.getSkillDetail(skillId), api.getExplain(skillId), api.getHistory(skillId)])
      .then(([d, e, h]) => {
        setDetail(d);
        setExplain(e);
        setHistory(h);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load this skill."));
  }, [skillId]);

  async function beginVerification() {
    if (!skillId) return;
    setStarting(true);
    try {
      const start = await api.startVerification(skillId);
      navigate(`/verify/${start.attemptId}?skillId=${skillId}`, { state: { skillName: detail?.skill.name, objective: start.objective } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start a verification session.");
      setStarting(false);
    }
  }

  if (error) return <p className="text-sm text-regressed">{error}</p>;
  if (!detail) return <p className="text-sm text-ink-faint">Loading...</p>;

  const tone = toneFor(detail.state.state);
  const canVerify = detail.state.state !== "UNKNOWN";

  return (
    <div className="max-w-3xl space-y-10">
      <div>
        <p className="text-xs uppercase tracking-wide text-ink-faint">{detail.skill.category}</p>
        <div className="flex items-center gap-3 mt-1">
          <h1 className="font-display text-3xl">{detail.skill.name}</h1>
          <StateBadge state={detail.state.state} />
        </div>
        <div className="mt-1"><ConfidenceBadge confidence={detail.state.confidence} /></div>
      </div>

      <section>
        <StateTrack state={detail.state.state} />
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-[0.15em] text-ink-faint mb-4">Evidence by dimension</h2>
        <div className="flex flex-wrap gap-6">
          {DIMENSION_META.map((dim) => (
            <CalibrationArc
              key={dim.key}
              label={dim.label}
              value={detail.state[dim.key]}
              threshold={dim.threshold}
              size="md"
              tone={detail.state[dim.key] !== null && (detail.state[dim.key] as number) >= dim.threshold ? "verified" : "neutral"}
            />
          ))}
        </div>
      </section>

      {explain && (
        <section>
          <button onClick={() => setShowRationale((v) => !v)} className="text-sm text-ink-soft underline decoration-line underline-offset-4">
            {showRationale ? "Hide" : "Why does ACEAPT believe this?"}
          </button>
          {showRationale && (
            <ul className="mt-3 space-y-1.5 text-sm text-ink-soft border-l border-line pl-4">
              {explain.rationale.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {history?.beforeAfter && (
        <section>
          <h2 className="text-xs uppercase tracking-[0.15em] text-ink-faint mb-4">Before / after</h2>
          <div className="grid grid-cols-2 gap-6 max-w-md">
            <div>
              <p className="text-xs text-ink-faint mb-2">Earlier evidence</p>
              <p className="font-mono tabular text-2xl">{history.beforeAfter.before.accuracy !== null ? Math.round(history.beforeAfter.before.accuracy * 100) : "-"}%</p>
            </div>
            <div>
              <p className="text-xs text-ink-faint mb-2">Recent evidence</p>
              <p className="font-mono tabular text-2xl text-verified">
                {history.beforeAfter.after.accuracy !== null ? Math.round(history.beforeAfter.after.accuracy * 100) : "-"}%
              </p>
            </div>
          </div>
        </section>
      )}

      {history && (
        <section>
          <h2 className="text-xs uppercase tracking-[0.15em] text-ink-faint mb-4">History</h2>
          <HistoryTimeline events={history.timeline} />
        </section>
      )}

      <section className="border-t border-line pt-6">
        <button
          onClick={beginVerification}
          disabled={starting || !canVerify}
          className="rounded-md bg-ink text-paper text-sm px-4 py-2.5 hover:bg-ink/90 disabled:opacity-50"
        >
          {starting ? "Starting..." : "Begin verification"}
        </button>
        {!canVerify && <p className="text-xs text-ink-faint mt-2">Practice this skill first before ACEAPT can verify it.</p>}
      </section>

      <div className={`text-xs ${tone === "verified" ? "text-verified" : "text-ink-faint"}`} />
    </div>
  );
}
