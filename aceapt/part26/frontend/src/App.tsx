import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { api } from "./api/client";
import type {
  AdaptationEvent,
  ContentItemPublic,
  NextActionResponse,
  PlanResponse,
  TopicCapabilityState
} from "./types";
import { CapabilitySnapshot } from "./components/CapabilitySnapshot";
import { NextBestAction } from "./components/NextBestAction";
import { TimeSelector } from "./components/TimeSelector";
import { AdaptivePlan } from "./components/AdaptivePlan";
import { ActionPlayer } from "./components/ActionPlayer";
import { AdaptiveHistory } from "./components/AdaptiveHistory";

type View =
  | { mode: "overview" }
  | { mode: "plan" }
  | { mode: "playing"; executionId: string; items: ContentItemPublic[] };

export default function App() {
  const [loading, setLoading] = useState(true);
  const [topics, setTopics] = useState<TopicCapabilityState[]>([]);
  const [nextAction, setNextAction] = useState<NextActionResponse | null>(null);
  const [planResponse, setPlanResponse] = useState<PlanResponse | null>(null);
  const [selectedMinutes, setSelectedMinutes] = useState<number | null>(null);
  const [view, setView] = useState<View>({ mode: "overview" });
  const [history, setHistory] = useState<AdaptationEvent[]>([]);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<{ correct: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renderKey, setRenderKey] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);

  async function loadCore() {
    const [{ topics: t }, next] = await Promise.all([api.getCapabilityState(), api.getNextAction()]);
    setTopics(t);
    setNextAction(next);
  }

  async function refreshHistory() {
    const { events } = await api.getHistory();
    setHistory(events);
  }

  useEffect(() => {
    (async () => {
      try {
        await loadCore();
        await refreshHistory();
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSelectMinutes(minutes: number) {
    setSelectedMinutes(minutes);
    setError(null);
    try {
      const plan = await api.getAdaptivePlan(minutes, true);
      setPlanResponse(plan);
      setView({ mode: "plan" });
      setRenderKey((k) => k + 1);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleStartCandidate(candidateActionId: string) {
    setStarting(true);
    setError(null);
    try {
      const started = await api.startAction(candidateActionId);
      setView({ mode: "playing", executionId: started.executionId, items: started.items });
      await refreshHistory();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStarting(false);
    }
  }

  async function handleSkip() {
    if (!nextAction?.action) return;
    setError(null);
    try {
      const result = await api.skipAction(nextAction.action.id);
      setNextAction(result.next);
      if (result.plan) setPlanResponse(result.plan);
      setRenderKey((k) => k + 1);
      await refreshHistory();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleSubmitAnswers(answers: { itemId: string; selectedIndex: number; responseTimeSeconds: number }[]) {
    if (view.mode !== "playing") return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.completeAction(view.executionId, answers);
      setTopics(result.states);
      setNextAction(result.next);
      setPlanResponse(result.plan);
      setLastResult({ correct: result.grade.correctCount, total: result.grade.totalCount });
      setView(result.plan ? { mode: "plan" } : { mode: "overview" });
      setRenderKey((k) => k + 1);
      await refreshHistory();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleCancelPlaying() {
    setView(selectedMinutes ? { mode: "plan" } : { mode: "overview" });
  }

  async function handleResetDemo() {
    setLoading(true);
    setSelectedMinutes(null);
    setPlanResponse(null);
    setLastResult(null);
    setView({ mode: "overview" });
    try {
      await api.resetDemo();
      await loadCore();
      await refreshHistory();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted">
        Loading your capability state…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink-950">
      <div className="mx-auto max-w-2xl px-5 py-8 sm:px-6">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <p className="font-display text-lg font-semibold tracking-tight text-paper">
              ACEAPT <span className="text-signal">⟡</span> Adapt
            </p>
            <p className="mt-0.5 text-sm text-muted">The highest-value thing to do with your time, right now.</p>
          </div>
          <button
            type="button"
            onClick={handleResetDemo}
            title="Reset demo data"
            className="flex flex-shrink-0 items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs text-faint transition-colors hover:border-line-soft hover:text-muted"
          >
            <RotateCcw size={12} />
            Reset
          </button>
        </header>

        <div className="mb-6">
          <CapabilitySnapshot topics={topics} />
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-alert/40 bg-alert/10 px-4 py-2.5 text-sm text-alert">
            {error}
          </div>
        )}

        {lastResult && view.mode !== "playing" && (
          <div className="mb-4 rounded-xl border border-signal/40 bg-signal/10 px-4 py-2.5 text-sm text-signal">
            Scored {lastResult.correct}/{lastResult.total} on that one - your plan just updated based on it.
          </div>
        )}

        {view.mode === "playing" && (
          <ActionPlayer
            items={view.items}
            onSubmit={handleSubmitAnswers}
            onCancel={handleCancelPlaying}
            submitting={submitting}
          />
        )}

        {view.mode !== "playing" && (
          <div key={renderKey} className="animate-fade-in space-y-5">
            {view.mode === "overview" && (
              <NextBestAction
                next={nextAction ?? { action: null, explanation: null, allStable: true }}
                topics={topics}
                onStart={() => nextAction?.action && handleStartCandidate(nextAction.action.id)}
                onSkip={handleSkip}
                starting={starting}
              />
            )}

            <div>
              <p className="mb-2.5 text-sm text-muted">
                {view.mode === "overview" ? "Or build a full plan:" : "Time budget"}
              </p>
              <TimeSelector value={selectedMinutes} onSelect={handleSelectMinutes} />
            </div>

            {view.mode === "plan" && planResponse && (
              <AdaptivePlan
                planResponse={planResponse}
                topics={topics}
                onStartItem={handleStartCandidate}
                busy={starting}
              />
            )}
          </div>
        )}

        <div className="mt-10 border-t border-line-soft pt-5">
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            className="text-sm text-faint transition-colors hover:text-muted"
          >
            {historyOpen ? "Hide" : "Show"} adaptive history
          </button>
          {historyOpen && (
            <div className="mt-4">
              <AdaptiveHistory events={history} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
