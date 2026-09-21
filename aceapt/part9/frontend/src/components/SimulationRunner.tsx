import { useCallback, useEffect, useRef, useState } from 'react';
import { PublicQuestion, PublicSimulationView, QuestionLocalState, SimulationReport } from '../types';
import * as api from '../api/client';
import { TimeBudgetRing } from './TimeBudgetRing';
import { QuestionPalette } from './QuestionPalette';
import { QuestionCard } from './QuestionCard';

interface Props {
  initialSimulation: PublicSimulationView;
  initialQuestion: PublicQuestion;
  onComplete: (report: SimulationReport) => void;
}

/**
 * The server clock is authoritative (spec section 13). This component
 * only ticks a LOCAL countdown for a smooth display and resyncs from
 * the server periodically + on completion - it never decides scoring
 * or expiry itself.
 */
const RESYNC_INTERVAL_MS = 20_000;

export function SimulationRunner({ initialSimulation, initialQuestion, onComplete }: Props) {
  const [simulation, setSimulation] = useState(initialSimulation);
  const [remainingSeconds, setRemainingSeconds] = useState(initialSimulation.remainingSeconds);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [questionCache, setQuestionCache] = useState<Record<number, PublicQuestion>>({
    0: initialQuestion,
  });
  const [answeredOptions, setAnsweredOptions] = useState<Record<number, string>>({});
  const [skippedIndices, setSkippedIndices] = useState<Set<number>>(new Set());
  const [loadingQuestion, setLoadingQuestion] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const finishingRef = useRef(false);

  const questionCount = simulation.questionCount;
  const currentQuestion = questionCache[currentIndex];

  const handleFinish = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setFinishing(true);
    try {
      const { report } = await api.completeSimulation(simulation.id);
      onComplete(report);
    } finally {
      setFinishing(false);
    }
  }, [simulation.id, onComplete]);

  // Local countdown tick.
  useEffect(() => {
    const tick = setInterval(() => {
      setRemainingSeconds((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  // Auto-finish when the local countdown reaches zero.
  useEffect(() => {
    if (remainingSeconds === 0) {
      void handleFinish();
    }
  }, [remainingSeconds, handleFinish]);

  // Periodic resync with the server-authoritative clock and progress.
  useEffect(() => {
    const resync = setInterval(async () => {
      try {
        const { simulation: fresh } = await api.getSimulation(simulation.id);
        setSimulation(fresh);
        setRemainingSeconds(fresh.remainingSeconds);
        if (fresh.status === 'COMPLETED') void handleFinish();
      } catch {
        // Transient network issue - next resync tick will retry.
      }
    }, RESYNC_INTERVAL_MS);
    return () => clearInterval(resync);
  }, [simulation.id, handleFinish]);

  // Fetch + open-log whenever the current question isn't cached yet.
  useEffect(() => {
    if (questionCache[currentIndex]) return;
    let cancelled = false;
    setLoadingQuestion(true);
    api
      .getQuestionAt(simulation.id, currentIndex)
      .then(({ question }) => {
        if (cancelled) return;
        setQuestionCache((c) => ({ ...c, [currentIndex]: question }));
      })
      .finally(() => !cancelled && setLoadingQuestion(false));
    return () => {
      cancelled = true;
    };
  }, [currentIndex, questionCache, simulation.id]);

  // Log OPEN once a question is actually on screen.
  useEffect(() => {
    if (currentQuestion) {
      void api.logOpenEvent(simulation.id, currentQuestion.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion?.id]);

  function navigate(index: number) {
    if (index < 0 || index >= questionCount) return;
    if (skippedIndices.has(index)) {
      const q = questionCache[index];
      if (q) void api.returnToQuestion(simulation.id, q.id);
    }
    void api.gotoQuestion(simulation.id, index);
    setCurrentIndex(index);
  }

  async function handleSelect(optionId: string) {
    if (!currentQuestion) return;
    setAnsweredOptions((a) => ({ ...a, [currentIndex]: optionId }));
    setSkippedIndices((s) => {
      const next = new Set(s);
      next.delete(currentIndex);
      return next;
    });
    await api.answerQuestion(simulation.id, currentQuestion.id, optionId);
  }

  async function handleSkip() {
    if (!currentQuestion) return;
    setSkippedIndices((s) => new Set(s).add(currentIndex));
    await api.skipQuestion(simulation.id, currentQuestion.id);
    if (currentIndex < questionCount - 1) navigate(currentIndex + 1);
  }

  const states: QuestionLocalState[] = Array.from({ length: questionCount }, (_, i) =>
    answeredOptions[i] ? 'answered' : skippedIndices.has(i) ? 'skipped' : 'untouched',
  );
  const remainingQuestions = questionCount - Object.keys(answeredOptions).length;

  return (
    <div className="mx-auto flex min-h-screen max-w-4xl flex-col px-6 py-8 text-bone">
      <header className="flex items-center justify-between gap-6 border-b border-inkline pb-6">
        <div>
          <p className="readout text-xs uppercase tracking-widest text-slate">
            {remainingQuestions} question{remainingQuestions === 1 ? '' : 's'} remaining
          </p>
          <QuestionPalette states={states} currentIndex={currentIndex} onNavigate={navigate} />
        </div>
        <TimeBudgetRing remainingSeconds={remainingSeconds} totalSeconds={simulation.durationSeconds} />
      </header>

      <main className="flex flex-1 flex-col py-10">
        {currentQuestion ? (
          <QuestionCard
            question={currentQuestion}
            sequence={currentIndex}
            questionCount={questionCount}
            selectedOptionId={answeredOptions[currentIndex] ?? null}
            onSelect={handleSelect}
          />
        ) : (
          <p className="text-slate">{loadingQuestion ? 'Loading question…' : 'Preparing…'}</p>
        )}
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-inkline pt-6">
        <div className="flex gap-2">
          <button
            onClick={() => navigate(currentIndex - 1)}
            disabled={currentIndex === 0}
            className="rounded-lg border border-inkline px-4 py-2 text-sm text-slate hover:border-slate disabled:opacity-40"
          >
            Previous
          </button>
          <button
            onClick={() => navigate(currentIndex + 1)}
            disabled={currentIndex === questionCount - 1}
            className="rounded-lg border border-inkline px-4 py-2 text-sm text-slate hover:border-slate disabled:opacity-40"
          >
            Next
          </button>
          <button
            onClick={handleSkip}
            className="rounded-lg border border-brass px-4 py-2 text-sm text-brasslight hover:bg-brass/10"
          >
            Skip
          </button>
        </div>
        <button
          onClick={() => void handleFinish()}
          disabled={finishing}
          className="rounded-lg bg-bone px-6 py-2.5 font-display text-sm font-semibold text-ink hover:opacity-90 disabled:opacity-50"
        >
          {finishing ? 'Submitting…' : 'Finish Simulation'}
        </button>
      </footer>
    </div>
  );
}
