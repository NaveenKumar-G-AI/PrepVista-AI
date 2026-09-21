import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError, type ReviewQueueItem } from "../api/client";

const REASON_LABEL: Record<string, string> = {
  AT_RISK: "At risk - recovery check recommended",
  MAINTENANCE_DUE: "Stable - light maintenance check",
  RETENTION_DUE: "Verified - retention check due",
  PROVISIONAL_CHECK_DUE: "Provisional - verification check due",
};

export function ReviewQueuePage() {
  const [queue, setQueue] = useState<ReviewQueueItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [startingSkillId, setStartingSkillId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .getReviewQueue()
      .then((res) => setQueue(res.queue))
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load your review queue."));
  }, []);

  async function beginCheck(skillId: string, skillName: string) {
    setStartingSkillId(skillId);
    try {
      const start = await api.startVerification(skillId);
      navigate(`/verify/${start.attemptId}?skillId=${skillId}`, { state: { skillName, objective: start.objective } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start a verification session.");
      setStartingSkillId(null);
    }
  }

  async function skip(skillId: string) {
    await api.skipReview(skillId);
    setQueue((q) => q?.filter((item) => item.skillId !== skillId) ?? null);
  }

  if (error) return <p className="text-sm text-regressed">{error}</p>;
  if (!queue) return <p className="text-sm text-ink-faint">Loading...</p>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="font-display text-2xl display-crossbar">Mastery checks</h1>
        <p className="mt-2 text-sm text-ink-soft">
          A short, prioritized list - not every skill, every day. Strong, stable skills need little upkeep; skills at risk surface here first.
        </p>
      </div>

      {queue.length === 0 ? (
        <p className="text-sm text-ink-faint">Nothing is due right now. Check back later, or visit the mastery map to verify a skill early.</p>
      ) : (
        <ol className="space-y-3">
          {queue.map((item, i) => (
            <li key={item.skillId} className="flex items-center justify-between rounded-lg border border-line bg-paper-raised p-4 shadow-card">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono tabular text-xs text-ink-faint">{i + 1}</span>
                  <h3 className="font-display text-base">{item.skill.name}</h3>
                </div>
                <p className="text-xs text-ink-faint mt-1">{REASON_LABEL[item.reason] ?? item.reason}</p>
                <p className="text-xs text-ink-faint">{item.estimatedMinutes}-minute check</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => skip(item.skillId)} className="text-xs text-ink-faint hover:text-ink-soft px-2 py-1">
                  Skip
                </button>
                <button
                  onClick={() => beginCheck(item.skillId, item.skill.name)}
                  disabled={startingSkillId === item.skillId}
                  className="rounded-md bg-ink text-paper text-sm px-3 py-1.5 hover:bg-ink/90 disabled:opacity-60"
                >
                  {startingSkillId === item.skillId ? "Starting..." : "Begin check"}
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
