import { useCallback, useState } from 'react';
import { api } from '../api/client.js';
import type {
  CurrentStepView,
  FullSolutionView,
  GuidanceView,
  NextStepPreview,
  ReconstructionResult,
  SessionView,
  StepResult,
  StudentFeedback,
  SummaryView,
} from '../api/types.js';
import { ApiError } from '../api/types.js';

export interface LastAttemptFeedback {
  result: StepResult;
  detail: string | null;
}

interface State {
  session: SessionView | null;
  currentStep: CurrentStepView | null;
  lastAttempt: LastAttemptFeedback | null;
  guidance: GuidanceView | null;
  nextStepPreview: NextStepPreview | null;
  fullSolution: FullSolutionView | null;
  reconstructionResult: ReconstructionResult | null;
  summary: SummaryView | null;
  loading: boolean;
  error: string | null;
}

const initialState: State = {
  session: null,
  currentStep: null,
  lastAttempt: null,
  guidance: null,
  nextStepPreview: null,
  fullSolution: null,
  reconstructionResult: null,
  summary: null,
  loading: false,
  error: null,
};

/**
 * Owns every piece of state the guided-solving workspace needs and wraps
 * every API call with a consistent loading/error pattern (Section 92:
 * frontend error states). This is intentionally one large hook rather than
 * many small ones - the workspace's pieces (problem, path, current step,
 * feedback, help) all change together in response to the same actions, so
 * splitting them into independent hooks would just move the coordination
 * problem around rather than solve it.
 */
export function useGuidedSession() {
  const [state, setState] = useState<State>(initialState);

  const withLoading = useCallback(async (fn: () => Promise<void>) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      await fn();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
      setState((s) => ({ ...s, error: message }));
    } finally {
      setState((s) => ({ ...s, loading: false }));
    }
  }, []);

  const loadCurrentStep = useCallback(async (sessionId: string) => {
    const { step } = await api.getCurrentStep(sessionId);
    setState((s) => ({ ...s, currentStep: step }));
  }, []);

  const start = useCallback(
    (problemId: string) =>
      withLoading(async () => {
        const { session } = await api.startSession(problemId);
        setState({
          ...initialState,
          session,
        });
        if (session.currentStepIndex < session.totalSteps) {
          await loadCurrentStep(session.sessionId);
        }
      }),
    [withLoading, loadCurrentStep],
  );

  const submit = useCallback(
    (rawInput: string) =>
      withLoading(async () => {
        const session = state.session;
        const step = state.currentStep;
        if (!session || !step) return;
        const result = await api.submitStep(session.sessionId, step.stepId, rawInput, {
          expectedVersion: session.version,
          clientRequestId: `${step.stepId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        });
        setState((s) => ({
          ...s,
          session: result.session,
          lastAttempt: { result: result.result, detail: result.detail },
          guidance: null,
          nextStepPreview: null,
        }));
        if (!result.allStepsComplete) {
          await loadCurrentStep(result.session.sessionId);
        } else {
          setState((s) => ({ ...s, currentStep: null }));
        }
      }),
    [state.session, state.currentStep, withLoading, loadCurrentStep],
  );

  const retry = useCallback(
    () =>
      withLoading(async () => {
        const session = state.session;
        const step = state.currentStep;
        if (!session || !step) return;
        const { step: refreshed } = await api.retryStep(session.sessionId, step.stepId);
        setState((s) => ({ ...s, currentStep: refreshed, lastAttempt: null }));
      }),
    [state.session, state.currentStep, withLoading],
  );

  const skip = useCallback(
    () =>
      withLoading(async () => {
        const session = state.session;
        const step = state.currentStep;
        if (!session || !step) return;
        const updated = await api.skipStep(session.sessionId, step.stepId);
        setState((s) => ({ ...s, session: updated.session, lastAttempt: null, guidance: null }));
        if (updated.session.currentStepIndex < updated.session.totalSteps) {
          await loadCurrentStep(updated.session.sessionId);
        } else {
          setState((s) => ({ ...s, currentStep: null }));
        }
      }),
    [state.session, state.currentStep, withLoading, loadCurrentStep],
  );

  const requestHint = useCallback(
    (studentNote?: string) =>
      withLoading(async () => {
        const session = state.session;
        const step = state.currentStep;
        if (!session || !step) return;
        const { guidance } = await api.requestGuidance(session.sessionId, step.stepId, studentNote);
        setState((s) => ({ ...s, guidance }));
      }),
    [state.session, state.currentStep, withLoading],
  );

  const requestExplain = useCallback(
    () =>
      withLoading(async () => {
        const session = state.session;
        const step = state.currentStep;
        if (!session || !step) return;
        const { guidance } = await api.requestExplanation(session.sessionId, step.stepId);
        setState((s) => ({ ...s, guidance }));
      }),
    [state.session, state.currentStep, withLoading],
  );

  const showNext = useCallback(
    () =>
      withLoading(async () => {
        const session = state.session;
        if (!session) return;
        const preview = await api.showNextStep(session.sessionId);
        setState((s) => ({ ...s, nextStepPreview: preview }));
      }),
    [state.session, withLoading],
  );

  const revealSolution = useCallback(
    () =>
      withLoading(async () => {
        const session = state.session;
        if (!session) return;
        const solution = await api.revealFullSolution(session.sessionId);
        const { session: refreshed } = await api.getSession(session.sessionId);
        setState((s) => ({ ...s, fullSolution: solution, session: refreshed, currentStep: null }));
      }),
    [state.session, withLoading],
  );

  const submitReconstruction = useCallback(
    (answers: Record<string, string>) =>
      withLoading(async () => {
        const session = state.session;
        if (!session) return;
        const result = await api.submitReconstruction(session.sessionId, answers);
        setState((s) => ({ ...s, reconstructionResult: result }));
      }),
    [state.session, withLoading],
  );

  const complete = useCallback(
    () =>
      withLoading(async () => {
        const session = state.session;
        if (!session) return;
        await api.completeSession(session.sessionId);
        const summary = await api.getSummary(session.sessionId);
        setState((s) => ({ ...s, summary }));
      }),
    [state.session, withLoading],
  );

  const startVerification = useCallback(
    () =>
      withLoading(async () => {
        const session = state.session;
        if (!session) return;
        const { session: verificationSession } = await api.startVerification(session.sessionId);
        setState({
          ...initialState,
          session: verificationSession,
        });
        if (verificationSession.currentStepIndex < verificationSession.totalSteps) {
          await loadCurrentStep(verificationSession.sessionId);
        }
      }),
    [state.session, withLoading, loadCurrentStep],
  );

  const submitFeedback = useCallback(
    (feedback: StudentFeedback) =>
      withLoading(async () => {
        const session = state.session;
        if (!session) return;
        await api.submitFeedback(session.sessionId, feedback);
      }),
    [state.session, withLoading],
  );

  const reset = useCallback(() => setState(initialState), []);

  return {
    ...state,
    actions: {
      start,
      submit,
      retry,
      skip,
      requestHint,
      requestExplain,
      showNext,
      revealSolution,
      submitReconstruction,
      complete,
      startVerification,
      submitFeedback,
      reset,
    },
  };
}
