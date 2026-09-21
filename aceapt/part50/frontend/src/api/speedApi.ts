// Thin fetch wrapper around the Feature 50 API (backend/src/api/routes.ts).
//
// Wire `getAuthToken` to however the host ACEAPT frontend already stores its
// session token - this module intentionally does not know about the host
// app's auth state (spec 5: reuse existing authentication, don't rebuild it).

import {
  BottleneckReport,
  PacingSummary,
  ScopeKey,
  SessionSummary,
  SpeedFrontierResult,
  SpeedProfile,
  SpeedSession,
  SpeedTarget,
  SubmitAttemptInput,
  SubmitAttemptResult,
  TrainingMode,
} from '../types/speed';

let getAuthToken: () => string | null = () => null;
let apiBaseUrl = '/api/speed';

export function configureSpeedApi(options: { getAuthToken: () => string | null; baseUrl?: string }) {
  getAuthToken = options.getAuthToken;
  if (options.baseUrl) apiBaseUrl = options.baseUrl;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const res = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed with status ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function scopeQuery(scope: ScopeKey): string {
  return `scopeType=${encodeURIComponent(scope.scopeType)}&scopeId=${encodeURIComponent(scope.scopeId)}`;
}

export const speedApi = {
  startSession(input: { mode: TrainingMode; scope: ScopeKey; guardrailAccuracy?: number; goalId?: string }) {
    return request<SpeedSession>('/sessions', { method: 'POST', body: JSON.stringify(input) });
  },
  getSession(sessionId: string) {
    return request<SpeedSession>(`/sessions/${sessionId}`);
  },
  submitAttempt(sessionId: string, input: SubmitAttemptInput) {
    return request<SubmitAttemptResult>(`/sessions/${sessionId}/attempts`, { method: 'POST', body: JSON.stringify(input) });
  },
  completeSession(sessionId: string) {
    return request<{ session: SpeedSession; summary: SessionSummary; attemptCount: number }>(`/sessions/${sessionId}/complete`, {
      method: 'POST',
    });
  },
  getProfile(scope: ScopeKey) {
    return request<SpeedProfile | null>(`/profile?${scopeQuery(scope)}`);
  },
  getBottlenecks(scope: ScopeKey) {
    return request<BottleneckReport>(`/bottlenecks?${scopeQuery(scope)}`);
  },
  getTargets(scope: ScopeKey) {
    return request<SpeedTarget | null>(`/targets?${scopeQuery(scope)}`);
  },
  getFrontier(scope: ScopeKey) {
    return request<SpeedFrontierResult>(`/frontier?${scopeQuery(scope)}`);
  },
  startPlacementSimulation(input: { totalQuestions: number; timeBudgetMs: number; speedSessionId?: string }) {
    return request<{ id: string }>('/placement-simulations', { method: 'POST', body: JSON.stringify(input) });
  },
  startPacingSession(input: { totalQuestions: number; timeBudgetMs: number; speedSessionId?: string }) {
    return request<{ id: string }>('/pacing-sessions', { method: 'POST', body: JSON.stringify(input) });
  },
  getPacingSummary(pacingSessionId: string) {
    return request<PacingSummary>(`/pacing/${pacingSessionId}`);
  },
};
