import { useState, useEffect, useRef, useCallback } from "react";
import { Clock, Flag, ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "../lib/api";
import type { ClientQuestion, ResponseState, SessionInfo, SessionEvidence } from "../lib/types";
import { formatClock } from "../lib/format";
import QuestionPalette from "./QuestionPalette";
import QuestionCard from "./QuestionCard";

interface Props {
  session: SessionInfo;
  questions: ClientQuestion[];
  onSubmitted: (result: { evidence: SessionEvidence; expired: boolean }) => void;
}

export default function TestRunner({ session, questions, onSubmitted }: Props) {
  const [responses, setResponses] = useState<Record<string, ResponseState>>({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [remainingSec, setRemainingSec] = useState(session.durationSec);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const activeStartRef = useRef<number>(Date.now());
  const submittedRef = useRef(false);
  const currentIndexRef = useRef(0);
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  // Loading current state works identically whether this session is brand
  // new (everything "unvisited") or being resumed after a refresh.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const state = await api.getSessionState(session.id);
        if (cancelled) return;
        const map: Record<string, ResponseState> = {};
        state.responses.forEach((r) => {
          map[r.questionId] = r;
        });
        setResponses(map);
        const firstUnanswered = questions.findIndex((q) => map[q.id]?.status !== "answered");
        const startIndex = firstUnanswered === -1 ? 0 : firstUnanswered;
        setCurrentIndex(startIndex);
        activeStartRef.current = Date.now();
        setReady(true);
        await api.navigate(session.id, {
          fromQuestionId: null,
          fromIndex: null,
          toQuestionId: questions[startIndex].id,
          toIndex: startIndex,
          elapsedMs: 0,
        });
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Could not load the session.");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  const doSubmit = useCallback(
    async (_reason: "manual" | "expired") => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);
      const elapsedMs = Date.now() - activeStartRef.current;
      const q = questions[currentIndexRef.current];
      try {
        const result = await api.submit(session.id, {
          finalQuestionId: q?.id ?? null,
          finalElapsedMs: elapsedMs,
        });
        onSubmitted(result);
      } catch (err) {
        submittedRef.current = false;
        setSubmitting(false);
        setLoadError(err instanceof Error ? err.message : "Submit failed — please try again.");
      }
    },
    [session.id, questions, onSubmitted]
  );

  // Countdown is re-derived from the server's started_at + durationSec every
  // tick, matching exactly how the backend computes usedSec on submit — the
  // displayed clock can never drift from what actually gets scored.
  useEffect(() => {
    if (!ready) return;
    const startedMs = new Date(session.startedAt).getTime();
    const tick = () => {
      const elapsed = (Date.now() - startedMs) / 1000;
      const remaining = Math.max(0, session.durationSec - elapsed);
      setRemainingSec(Math.ceil(remaining));
      if (remaining <= 0 && !submittedRef.current) {
        doSubmit("expired");
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [ready, session.startedAt, session.durationSec, doSubmit]);

  async function goTo(nextIndex: number) {
    if (nextIndex === currentIndex || nextIndex < 0 || nextIndex >= questions.length) return;
    const fromQ = questions[currentIndex];
    const toQ = questions[nextIndex];
    const elapsedMs = Date.now() - activeStartRef.current;
    activeStartRef.current = Date.now();
    setCurrentIndex(nextIndex);
    setResponses((prev) => {
      const cur = prev[toQ.id];
      if (!cur || cur.status === "unvisited") {
        return {
          ...prev,
          [toQ.id]: { ...(cur ?? { questionId: toQ.id, selectedIndex: null, markedForReview: false }), status: "viewed" },
        };
      }
      return prev;
    });
    try {
      await api.navigate(session.id, {
        fromQuestionId: fromQ.id,
        fromIndex: currentIndex,
        toQuestionId: toQ.id,
        toIndex: nextIndex,
        elapsedMs,
      });
    } catch {
      // Non-fatal for exam flow — final submit still flushes the last
      // active question, and the server clock remains authoritative either way.
    }
  }

  async function selectOption(optionIndex: number) {
    const q = questions[currentIndex];
    setResponses((prev) => ({
      ...prev,
      [q.id]: { ...(prev[q.id] ?? { questionId: q.id, markedForReview: false }), status: "answered", selectedIndex: optionIndex },
    }));
    try {
      await api.answer(session.id, q.id, optionIndex);
    } catch {
      /* optimistic UI stands; server sync retried implicitly via next action */
    }
  }

  async function clearResponse() {
    const q = questions[currentIndex];
    setResponses((prev) => ({ ...prev, [q.id]: { ...prev[q.id], status: "viewed", selectedIndex: null } }));
    try {
      await api.clear(session.id, q.id);
    } catch {
      /* see selectOption */
    }
  }

  async function toggleMark() {
    const q = questions[currentIndex];
    const nextMarked = !responses[q.id]?.markedForReview;
    setResponses((prev) => ({ ...prev, [q.id]: { ...prev[q.id], markedForReview: nextMarked } }));
    try {
      await api.mark(session.id, q.id, nextMarked);
    } catch {
      /* see selectOption */
    }
  }

  if (loadError) {
    return <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700">{loadError}</div>;
  }
  if (!ready) {
    return <div className="py-24 text-center text-slate-400">Loading your simulation…</div>;
  }

  const current = questions[currentIndex];
  const currentResponse = responses[current.id];
  const answeredCount = Object.values(responses).filter((r) => r.status === "answered").length;
  const markedCount = Object.values(responses).filter((r) => r.markedForReview).length;
  const unattemptedCount = questions.length - answeredCount;

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <div>
          <div className="font-semibold text-slate-900">Real-World Aptitude Simulation</div>
          <div className="text-xs text-slate-400">No hints, no topic labels — just like the real thing.</div>
        </div>
        <div
          className={`flex items-center gap-2 rounded-lg px-3 py-1.5 font-mono text-sm font-semibold ${
            remainingSec < 120 ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-700"
          }`}
        >
          <Clock size={16} /> {formatClock(remainingSec)}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_220px]">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <QuestionCard question={current} total={questions.length} response={currentResponse} onSelect={selectOption} />

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <button
              onClick={clearResponse}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              Clear Response
            </button>
            <button
              onClick={toggleMark}
              className={`rounded-xl border px-4 py-2 text-sm font-medium ${
                currentResponse?.markedForReview
                  ? "border-amber-400 bg-amber-50 text-amber-700"
                  : "border-slate-300 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Flag size={14} className="mr-1 inline" />
              {currentResponse?.markedForReview ? "Marked" : "Mark for Review"}
            </button>
            <div className="flex-1" />
            {currentIndex > 0 && (
              <button
                onClick={() => goTo(currentIndex - 1)}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                <ChevronLeft size={16} className="inline" /> Previous
              </button>
            )}
            {currentIndex < questions.length - 1 ? (
              <button
                onClick={() => goTo(currentIndex + 1)}
                className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Save &amp; Next <ChevronRight size={16} className="inline" />
              </button>
            ) : (
              <button
                onClick={() => setShowConfirm(true)}
                className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Submit Test
              </button>
            )}
          </div>
          <button onClick={() => setShowConfirm(true)} className="mt-3 text-xs text-slate-400 underline hover:text-slate-600">
            Submit test now
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Question Palette</div>
          <QuestionPalette questions={questions} responses={responses} currentIndex={currentIndex} onJump={goTo} />
        </div>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-2 text-lg font-semibold text-slate-900">Submit test?</h3>
            <p className="mb-5 text-sm text-slate-600">
              {answeredCount} answered · {markedCount} marked for review · {unattemptedCount} not attempted.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 rounded-xl border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50"
              >
                Keep Working
              </button>
              <button
                disabled={submitting}
                onClick={() => doSubmit("manual")}
                className="flex-1 rounded-xl bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {submitting ? "Submitting…" : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
