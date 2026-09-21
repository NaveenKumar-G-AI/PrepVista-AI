import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { fmtMs } from "../lib/format";
import type { DeliverableQuestion } from "../lib/types";
import { QuestionNavigator, type QState } from "../components/simulation/QuestionNavigator";

interface LocalEvent {
  questionId: string | null;
  eventType: string;
  eventTimestamp: string;
  payload: Record<string, unknown>;
}

export default function SimulationRunnerPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [questions, setQuestions] = useState<DeliverableQuestion[] | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [visited, setVisited] = useState<Set<string>>(new Set());
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const questionEnteredAtRef = useRef(Date.now());
  const pendingEventsRef = useRef<LocalEvent[]>([]);
  const startedRef = useRef(false);
  const submittedRef = useRef(false);

  const emit = (questionId: string | null, eventType: string, payload: Record<string, unknown> = {}) => {
    pendingEventsRef.current.push({ questionId, eventType, eventTimestamp: new Date().toISOString(), payload });
  };

  const flush = () => {
    if (pendingEventsRef.current.length === 0 || !id) return;
    const batch = pendingEventsRef.current;
    pendingEventsRef.current = [];
    api.post(`/simulations/${id}/events`, { events: batch }).catch(() => {
      // Best-effort for this reference build — a production client would
      // retry/queue. Re-queue so a later flush (or submit) has another shot.
      pendingEventsRef.current = [...batch, ...pendingEventsRef.current];
    });
  };

  const recordDelta = (): number => {
    const delta = Math.max(0, Math.round((Date.now() - questionEnteredAtRef.current) / 1000));
    questionEnteredAtRef.current = Date.now();
    return delta;
  };

  useEffect(() => {
    if (!id) return;
    api.get<{ simulation: { durationMinutes: number }; questions: DeliverableQuestion[] }>(`/simulations/${id}`).then((d) => {
      setQuestions(d.questions);
      setRemainingSeconds(d.simulation.durationMinutes * 60);

      if (!startedRef.current) {
        startedRef.current = true;
        emit(null, "ASSESSMENT_STARTED");
        const first = d.questions[0];
        if (first) {
          emit(first.questionId, "QUESTION_VIEWED");
          setVisited(new Set([first.questionId]));
        }
        flush();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const currentQ = questions?.[currentIndex] ?? null;

  const states: QState[] = useMemo(() => {
    if (!questions) return [];
    return questions.map((q) => {
      if (answers[q.questionId]) return "answered";
      if (skipped.has(q.questionId)) return "skipped";
      return "unvisited";
    });
  }, [questions, answers, skipped]);

  function goTo(newIndex: number) {
    if (!questions || newIndex === currentIndex || newIndex < 0 || newIndex >= questions.length) return;
    const leaving = questions[currentIndex]!;
    const delta = recordDelta();
    if (delta > 0) emit(leaving.questionId, "QUESTION_VIEWED", { timeSpentDeltaSeconds: delta });

    const entering = questions[newIndex]!;
    if (visited.has(entering.questionId)) {
      emit(entering.questionId, "QUESTION_REVISITED");
    } else {
      emit(entering.questionId, "QUESTION_VIEWED");
      setVisited((prev) => new Set(prev).add(entering.questionId));
    }
    setCurrentIndex(newIndex);
    flush();
  }

  function selectOption(optionId: string) {
    if (!currentQ) return;
    const delta = recordDelta();
    setAnswers((prev) => ({ ...prev, [currentQ.questionId]: optionId }));
    setSkipped((prev) => {
      const next = new Set(prev);
      next.delete(currentQ.questionId);
      return next;
    });
    emit(currentQ.questionId, "QUESTION_ANSWERED", { selectedOptionId: optionId, timeSpentDeltaSeconds: delta });
    flush();
  }

  function skipCurrent() {
    if (!currentQ || !questions) return;
    const delta = recordDelta();
    setSkipped((prev) => new Set(prev).add(currentQ.questionId));
    emit(currentQ.questionId, "QUESTION_SKIPPED", { timeSpentDeltaSeconds: delta });
    flush();
    if (currentIndex < questions.length - 1) goTo(currentIndex + 1);
  }

  async function handleSubmit() {
    if (!questions || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    const current = questions[currentIndex]!;
    const delta = recordDelta();
    if (delta > 0) emit(current.questionId, "QUESTION_VIEWED", { timeSpentDeltaSeconds: delta });
    emit(null, "ASSESSMENT_SUBMITTED");
    flush();
    await new Promise((r) => setTimeout(r, 250)); // let the final flush's request land before submit reconciles
    try {
      await api.post(`/simulations/${id}/submit`);
      navigate(`/simulations/${id}/result`);
    } catch {
      submittedRef.current = false;
      setSubmitting(false);
    }
  }

  useEffect(() => {
    if (!questions) return;
    const interval = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          window.clearInterval(interval);
          if (!submittedRef.current) handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions]);

  if (!questions || !currentQ) {
    return <div className="text-center text-paper-500 py-24 text-sm">Loading assessment…</div>;
  }

  const lowTime = remainingSeconds < 120;

  return (
    <div className="grid lg:grid-cols-4 gap-6">
      <div className="lg:col-span-3">
        <div className="flex items-center justify-between mb-4">
          <span className="label-caps">{currentQ.section}</span>
          <span className={`data-figure text-lg font-medium ${lowTime ? "text-signal-risk" : "text-paper-100"}`}>
            {fmtMs(remainingSeconds * 1000)}
          </span>
        </div>

        <div className="panel p-6 mb-4 min-h-[280px] flex flex-col">
          <div className="label-caps mb-3">
            Question {currentIndex + 1} of {questions.length}
          </div>
          <p className="text-paper-100 text-base leading-relaxed mb-6">{currentQ.prompt}</p>

          <div className="flex flex-col gap-2">
            {currentQ.options.map((opt) => {
              const selected = answers[currentQ.questionId] === opt.id;
              return (
                <button
                  key={opt.id}
                  onClick={() => selectOption(opt.id)}
                  className={`text-left rounded-lg border px-4 py-3 text-sm transition-colors ${
                    selected ? "border-signal-ready/60 bg-signal-ready/10 text-paper-100" : "border-ink-600 text-paper-300 hover:border-ink-500"
                  }`}
                >
                  <span className={`data-figure mr-2.5 ${selected ? "text-signal-ready" : "text-paper-500"}`}>
                    {opt.id.toUpperCase()}
                  </span>
                  {opt.text}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => goTo(currentIndex - 1)}
            disabled={currentIndex === 0}
            className="rounded-lg border border-ink-600 text-paper-300 text-sm px-4 py-2.5 hover:border-ink-500 disabled:opacity-30"
          >
            Previous
          </button>
          <div className="flex gap-2">
            <button onClick={skipCurrent} className="rounded-lg border border-ink-600 text-paper-300 text-sm px-4 py-2.5 hover:border-ink-500">
              Skip
            </button>
            {currentIndex < questions.length - 1 ? (
              <button
                onClick={() => goTo(currentIndex + 1)}
                className="rounded-lg bg-ink-700 text-paper-100 text-sm px-5 py-2.5 hover:bg-ink-600"
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="rounded-lg bg-signal-ready text-ink-950 font-medium text-sm px-5 py-2.5 hover:bg-signal-ready/90 disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Submit assessment"}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="panel p-5 h-fit">
        <div className="label-caps mb-3">Navigator</div>
        <QuestionNavigator count={questions.length} states={states} currentIndex={currentIndex} onJump={goTo} />
        <div className="mt-4 pt-4 border-t hairline flex flex-col gap-1.5 text-xs text-paper-500">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-sm bg-signal-ready/60" /> Answered ({Object.keys(answers).length})
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-sm bg-signal-developing/60" /> Skipped ({skipped.size})
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-sm border border-ink-600" /> Unvisited (
            {questions.length - Object.keys(answers).length - skipped.size})
          </div>
        </div>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full mt-4 rounded-lg border border-signal-ready/40 text-signal-ready text-sm py-2.5 hover:bg-signal-ready/5 disabled:opacity-50"
        >
          {submitting ? "Submitting…" : "End & submit"}
        </button>
      </div>
    </div>
  );
}
