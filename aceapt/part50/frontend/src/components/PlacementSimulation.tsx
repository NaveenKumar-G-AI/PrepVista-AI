import React, { useEffect, useState } from 'react';
import { speedApi } from '../api/speedApi';
import { AttemptDecision, PacingSummary, QuestionContext } from '../types/speed';
import { PacingPanel } from './PacingPanel';
import { DecisionTraining } from './DecisionTraining';

export interface PlacementSimulationProps {
  totalQuestions: number;
  timeBudgetMinutes: number;
  currentQuestion: QuestionContext | null;
  onDecision: (decision: AttemptDecision, questionId: string) => void;
  flaggedCount: number;
  onFinish: () => void;
}

/** Spec 62, 74-75: mixed-difficulty, limited-time, review/flag/return
 * workflow. Deliberately kept separate from any formal assessment mode -
 * this is training, not a certified test session (spec 75). */
export function PlacementSimulation({ totalQuestions, timeBudgetMinutes, currentQuestion, onDecision, flaggedCount, onFinish }: PlacementSimulationProps) {
  const [pacingSessionId, setPacingSessionId] = useState<string | null>(null);
  const [summary, setSummary] = useState<PacingSummary | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startRef = React.useRef(Date.now());

  useEffect(() => {
    speedApi
      .startPlacementSimulation({ totalQuestions, timeBudgetMs: timeBudgetMinutes * 60000 })
      .then((s) => setPacingSessionId(s.id))
      .catch(() => setPacingSessionId(null));
  }, [totalQuestions, timeBudgetMinutes]);

  useEffect(() => {
    const id = window.setInterval(() => setElapsedMs(Date.now() - startRef.current), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!pacingSessionId) return;
    speedApi
      .getPacingSummary(pacingSessionId)
      .then(setSummary)
      .catch(() => undefined);
  }, [pacingSessionId, elapsedMs]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Placement simulation</h2>
        {flaggedCount > 0 && <span className="text-xs text-slate-500">{flaggedCount} flagged for review</span>}
      </div>

      {summary && <PacingPanel summary={summary} questionsCompleted={0} totalQuestions={totalQuestions} elapsedMs={elapsedMs} timeBudgetMs={timeBudgetMinutes * 60000} />}

      {currentQuestion ? (
        <DecisionTraining
          recommendation="ATTEMPT"
          rationale="Use your judgment - this simulation trains the decision itself, not just the answer."
          onChoose={(decision) => onDecision(decision, currentQuestion.questionId)}
        />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
          <p className="text-sm text-slate-600">No more questions in the first pass. Review flagged questions, or finish.</p>
          <button type="button" onClick={onFinish} className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700">
            Finish simulation
          </button>
        </div>
      )}
    </div>
  );
}

export default PlacementSimulation;
