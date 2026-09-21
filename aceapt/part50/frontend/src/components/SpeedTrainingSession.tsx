import React, { useCallback, useEffect, useRef, useState } from 'react';
import { speedApi } from '../api/speedApi';
import { AttemptFeedback, QuestionContext, SpeedSession, TrainingPolicyDecision } from '../types/speed';
import { SpeedMeter } from './SpeedMeter';
import { AccuracyGuardrail } from './AccuracyGuardrail';
import { SpeedFeedback } from './SpeedFeedback';

export interface SpeedTrainingSessionProps {
  session: SpeedSession;
  /** The host app supplies the next question - Feature 50 trains pace, it
   * does not own the question bank (spec 5: reuse existing question data). */
  currentQuestion: QuestionContext;
  /** Rendered by the host app's own question UI; this component only needs
   * to know when the student has answered and whether they were correct. */
  renderQuestion: (onAnswered: (correct: boolean) => void) => React.ReactNode;
  onSessionUpdate?: (session: SpeedSession) => void;
  onEnded?: () => void;
}

/** Spec 89, 92: the live-session shell - target/guardrail visible at all
 * times, timer never pressures visually, feedback follows every answer. */
export function SpeedTrainingSession({ session, currentQuestion, renderQuestion, onSessionUpdate, onEnded }: SpeedTrainingSessionProps) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [rollingAccuracy, setRollingAccuracy] = useState(1);
  const [lastFeedback, setLastFeedback] = useState<{ feedback: AttemptFeedback; correct: boolean; coachingNote: string | null } | null>(null);
  const [policy, setPolicy] = useState<TrainingPolicyDecision | null>(null);
  const [currentSession, setCurrentSession] = useState(session);
  const [correctSoFar, setCorrectSoFar] = useState(0);
  const [totalSoFar, setTotalSoFar] = useState(0);
  const startRef = useRef<number>(Date.now());

  useEffect(() => {
    startRef.current = Date.now();
    setElapsedMs(0);
    const id = window.setInterval(() => setElapsedMs(Date.now() - startRef.current), 250);
    return () => window.clearInterval(id);
  }, [currentQuestion.questionId]);

  const handleAnswered = useCallback(
    async (correct: boolean) => {
      const responseTimeMs = Date.now() - startRef.current;
      const result = await speedApi.submitAttempt(currentSession.id, {
        question: currentQuestion,
        responseTimeMs,
        correct,
        independent: true,
        hintLevel: 0,
        clientAttemptId: `${currentSession.id}-${currentQuestion.questionId}-${Date.now()}`,
      });

      setLastFeedback({ feedback: result.feedback, correct, coachingNote: result.coachingNote });
      setPolicy(result.policy);
      setCurrentSession(result.session);
      onSessionUpdate?.(result.session);
      setCorrectSoFar((c) => c + (correct ? 1 : 0));
      setTotalSoFar((t) => t + 1);
      setRollingAccuracy((correctSoFar + (correct ? 1 : 0)) / (totalSoFar + 1));

      if (result.session.state === 'PRESSURE_ADJUSTMENT') {
        // Brief pause is intentional - the student should see WHY pace is easing.
      }
      if (result.session.state === 'COMPLETED' || result.session.state === 'ABANDONED') {
        onEnded?.();
      }
    },
    [currentSession.id, currentQuestion, correctSoFar, totalSoFar, onSessionUpdate, onEnded],
  );

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SpeedMeter elapsedMs={elapsedMs} targetMs={currentSession.targetTimeMs} />
        <AccuracyGuardrail rollingAccuracy={rollingAccuracy} guardrail={currentSession.guardrailAccuracy} />
      </div>

      {currentSession.state === 'PRESSURE_ADJUSTMENT' && policy && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{policy.message}</div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-5">{renderQuestion(handleAnswered)}</div>

      {lastFeedback && <SpeedFeedback feedback={lastFeedback.feedback} correct={lastFeedback.correct} coachingNote={lastFeedback.coachingNote} />}
    </div>
  );
}

export default SpeedTrainingSession;
