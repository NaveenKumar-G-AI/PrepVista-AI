import { ApiError } from './types.js';
import type {
  CurrentStepView,
  FullSolutionView,
  GuidanceView,
  NextStepPreview,
  ProblemSummary,
  ReconstructionResult,
  SessionView,
  StudentFeedback,
  SubmitStepResult,
  SummaryView,
} from './types.js';

const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';
const TOKEN_STORAGE_KEY = 'aceapt.guidedSolving.devToken';
const STUDENT_ID_STORAGE_KEY = 'aceapt.guidedSolving.devStudentId';

/**
 * DEV-ONLY AUTH BOOTSTRAP.
 *
 * ACEAPT already has a real login system. This app is a standalone
 * demonstration of Feature 47, so it bootstraps a throwaway identity via the
 * backend's /api/dev/token route (see backend/src/api/routes/dev.routes.ts)
 * the first time it loads, and reuses it from localStorage after that.
 * Replace this whole function with ACEAPT's real auth/session wiring when
 * this UI is embedded in the real product - every other function in this
 * file only cares that `getToken()` returns *some* valid bearer token.
 */
async function ensureDevIdentity(): Promise<string> {
  const existing = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (existing) return existing;

  let studentId = localStorage.getItem(STUDENT_ID_STORAGE_KEY);
  if (!studentId) {
    studentId = `demo-student-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(STUDENT_ID_STORAGE_KEY, studentId);
  }

  const res = await fetch(`${API_BASE_URL}/api/dev/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId }),
  });
  if (!res.ok) {
    throw new ApiError(res.status, 'DEV_AUTH_FAILED', 'Could not bootstrap a dev token from the backend.');
  }
  const data = (await res.json()) as { token: string };
  localStorage.setItem(TOKEN_STORAGE_KEY, data.token);
  return data.token;
}

export function resetDevIdentity(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(STUDENT_ID_STORAGE_KEY);
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await ensureDevIdentity();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (res.status === 204) return undefined as T;

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, body.error ?? 'UNKNOWN_ERROR', body.message ?? `Request to ${path} failed (${res.status}).`);
  }
  return body as T;
}

export const api = {
  listProblems: () => request<{ problems: ProblemSummary[] }>('/api/guided/problems'),

  startSession: (problemId: string) =>
    request<{ session: SessionView }>('/api/guided/sessions', { method: 'POST', body: JSON.stringify({ problemId }) }),

  getSession: (sessionId: string) => request<{ session: SessionView }>(`/api/guided/sessions/${sessionId}`),

  getCurrentStep: (sessionId: string) => request<{ step: CurrentStepView }>(`/api/guided/sessions/${sessionId}/current-step`),

  submitStep: (sessionId: string, stepId: string, rawInput: string, opts?: { expectedVersion?: number; clientRequestId?: string }) =>
    request<SubmitStepResult>(`/api/guided/sessions/${sessionId}/steps/${stepId}/submit`, {
      method: 'POST',
      body: JSON.stringify({ rawInput, ...opts }),
    }),

  retryStep: (sessionId: string, stepId: string) =>
    request<{ step: CurrentStepView }>(`/api/guided/sessions/${sessionId}/steps/${stepId}/retry`, { method: 'POST' }),

  skipStep: (sessionId: string, stepId: string) =>
    request<{ session: SessionView }>(`/api/guided/sessions/${sessionId}/steps/${stepId}/skip`, { method: 'POST' }),

  requestGuidance: (sessionId: string, stepId: string, studentNote?: string) =>
    request<{ guidance: GuidanceView }>(`/api/guided/sessions/${sessionId}/steps/${stepId}/guidance`, {
      method: 'POST',
      body: JSON.stringify({ studentNote }),
    }),

  requestExplanation: (sessionId: string, stepId: string) =>
    request<{ guidance: GuidanceView }>(`/api/guided/sessions/${sessionId}/steps/${stepId}/explain`, { method: 'POST' }),

  showNextStep: (sessionId: string) => request<NextStepPreview>(`/api/guided/sessions/${sessionId}/show-next-step`, { method: 'POST' }),

  revealFullSolution: (sessionId: string) =>
    request<FullSolutionView>(`/api/guided/sessions/${sessionId}/reveal-solution`, { method: 'POST' }),

  submitReconstruction: (sessionId: string, answers: Record<string, string>) =>
    request<ReconstructionResult>(`/api/guided/sessions/${sessionId}/reconstruction`, {
      method: 'POST',
      body: JSON.stringify({ answers }),
    }),

  completeSession: (sessionId: string) =>
    request<{ outcome: SummaryView['outcome'] }>(`/api/guided/sessions/${sessionId}/complete`, { method: 'POST' }),

  startVerification: (sessionId: string) =>
    request<{ session: SessionView }>(`/api/guided/sessions/${sessionId}/verification`, { method: 'POST' }),

  getSummary: (sessionId: string) => request<SummaryView>(`/api/guided/sessions/${sessionId}/summary`),

  submitFeedback: (sessionId: string, feedback: StudentFeedback) =>
    request<void>(`/api/guided/sessions/${sessionId}/feedback`, { method: 'POST', body: JSON.stringify({ feedback }) }),
};
