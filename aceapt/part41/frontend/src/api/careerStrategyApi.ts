import type { CommandCenterView, TimelineEntry, NotNowReason, FeedbackValue } from '../types';

/**
 * Thin fetch wrapper for the routes mounted by backend/src/app.ts under
 * /api/feature41. Adjust `baseUrl` and the auth header to match however
 * ACEAPT's real frontend already authenticates its API calls — the
 * `x-student-id` header here matches the DEV-ONLY placeholder auth in
 * backend/src/middleware/index.ts and must be replaced together with it.
 */
export function createCareerStrategyApi(baseUrl: string, getAuthHeaders: () => Record<string, string>) {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders(), ...(init?.headers ?? {}) },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Feature 41 API ${res.status}: ${body || res.statusText}`);
    }
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  return {
    getCommandCenter: (studentId: string) => request<CommandCenterView>(`/api/feature41/command-center/${studentId}`),

    getTimeline: (studentId: string) => request<{ strategyId: string; timeline: TimelineEntry[] }>(`/api/feature41/timeline/${studentId}`),

    confirmStrategyChange: (studentId: string, body: { newTargetRole: string; newGoalId?: string | null; reason: string; assumptions?: string[] }) =>
      request(`/api/feature41/strategy/${studentId}/confirm-change`, { method: 'POST', body: JSON.stringify(body) }),

    updateActionStatus: (actionId: string, status: 'accepted' | 'not_now' | 'in_progress' | 'completed' | 'skipped', notNowReason?: NotNowReason) =>
      request(`/api/feature41/actions/${actionId}/status`, { method: 'PATCH', body: JSON.stringify({ status, notNowReason }) }),

    sendRecommendationFeedback: (recommendationId: string, feedback: FeedbackValue, notNowReason?: NotNowReason) =>
      request(`/api/feature41/recommendations/${recommendationId}/feedback`, { method: 'POST', body: JSON.stringify({ feedback, notNowReason }) }),

    generateReview: (studentId: string) => request(`/api/feature41/review/${studentId}/generate`, { method: 'POST' }),
  };
}

export type CareerStrategyApi = ReturnType<typeof createCareerStrategyApi>;
