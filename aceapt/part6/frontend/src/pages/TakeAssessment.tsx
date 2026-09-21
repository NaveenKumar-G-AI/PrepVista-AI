import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '../api/client';
import type { AssessmentStateResponse } from '../api/types';
import { ProgressRail } from '../components/ProgressRail';
import { QuestionPanel } from '../components/QuestionPanel';

export function TakeAssessment({
  assessmentId,
  onSubmitted,
  onExit,
}: {
  assessmentId: string;
  onSubmitted: (assessmentId: string) => void;
  onExit: () => void;
}) {
  const [state, setState] = useState<AssessmentStateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    (async () => {
      try {
        const initial = await api.getAssessment(assessmentId);
        const next = initial.assessment.status === 'NOT_STARTED' ? await api.startAssessment(assessmentId) : initial;
        setState(next);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Could not load this assessment.');
      }
    })();
  }, [assessmentId]);

  const doSubmitFinal = useCallback(async () => {
    setSubmitting(true);
    try {
      await api.submitAssessment(assessmentId);
      onSubmitted(assessmentId);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not submit the assessment.');
      setSubmitting(false);
    }
  }, [assessmentId, onSubmitted]);

  // Auto-submit once time is up. The visible countdown is purely client-side display (Timer ticks
  // locally between server syncs), so reaching zero on screen doesn't by itself change anything server-side -
  // this callback forces a round-trip (which runs the server's own expiry check) the moment it happens,
  // rather than waiting for the student's next unrelated action. The server remains the real authority
  // either way (sessionService.checkExpiry runs on every request regardless of this callback).
  const handleExpire = useCallback(async () => {
    if (submitting) return;
    try {
      const fresh = await api.getAssessment(assessmentId);
      if (fresh.assessment.status === 'IN_PROGRESS') return; // clock drift - server disagrees, keep going
      await doSubmitFinal();
    } catch {
      // best-effort; the student's next real action will still resolve correctly via checkExpiry
    }
  }, [assessmentId, submitting, doSubmitFinal]);

  const selectOption = async (optionId: string) => {
    if (!state?.currentQuestion) return;
    setState((prev) => (prev ? { ...prev, selectedOptionId: optionId } : prev)); // optimistic
    try {
      const next = await api.submitAnswer(assessmentId, state.currentQuestion.id, optionId);
      setState(next);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save that answer.');
    }
  };

  const skipCurrent = async () => {
    if (!state?.currentQuestion) return;
    try {
      const next = await api.skip(assessmentId, state.currentQuestion.id);
      await goToRelative(next, 1);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not skip this question.');
    }
  };

  const jumpTo = async (questionId: string) => {
    try {
      const next = await api.navigate(assessmentId, questionId);
      setState(next);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not navigate to that question.');
    }
  };

  const goToRelative = async (fromState: AssessmentStateResponse, delta: number) => {
    const currentIndex = fromState.questionOrder.findIndex((q) => q.id === fromState.currentQuestion?.id);
    const targetIndex = currentIndex + delta;
    if (targetIndex < 0 || targetIndex >= fromState.questionOrder.length) {
      setState(fromState);
      return;
    }
    const targetId = fromState.questionOrder[targetIndex].id;
    const next = await api.navigate(assessmentId, targetId);
    setState(next);
  };

  if (error) {
    return (
      <div className="container center-column" style={{ paddingTop: 'var(--space-8)' }}>
        <p style={{ color: '#e2a23d', marginBottom: 'var(--space-4)' }}>{error}</p>
        <button className="btn btn-secondary" onClick={onExit}>Back to start</button>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="container center-column" style={{ paddingTop: 'var(--space-8)' }}>
        <p className="eyebrow">Preparing assessment…</p>
      </div>
    );
  }

  const currentIndex = state.questionOrder.findIndex((q) => q.id === state.currentQuestion?.id);
  const isLast = currentIndex === state.questionOrder.length - 1;

  return (
    <div className="container stack-lg" style={{ paddingTop: 'var(--space-6)', paddingBottom: 'var(--space-8)' }}>
      <ProgressRail
        questionOrder={state.questionOrder}
        currentQuestionId={state.currentQuestion?.id ?? null}
        remainingSeconds={state.remainingSeconds}
        totalSeconds={state.assessment.durationSeconds}
        answered={state.progress.answered}
        total={state.progress.total}
        onJump={jumpTo}
        onExpire={handleExpire}
      />

      {state.currentQuestion && (
        <QuestionPanel
          question={state.currentQuestion}
          selectedOptionId={state.selectedOptionId}
          onSelect={selectOption}
          disabled={submitting}
        />
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)' }}>
        <button
          className="btn btn-secondary"
          disabled={currentIndex <= 0 || submitting}
          onClick={() => goToRelative(state, -1)}
        >
          ← Previous
        </button>
        <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
          <button className="btn btn-ghost" onClick={skipCurrent} disabled={submitting}>
            Skip
          </button>
          {isLast ? (
            <button className="btn btn-primary" onClick={doSubmitFinal} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit assessment'}
            </button>
          ) : (
            <button className="btn btn-primary" disabled={submitting} onClick={() => goToRelative(state, 1)}>
              Next →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
