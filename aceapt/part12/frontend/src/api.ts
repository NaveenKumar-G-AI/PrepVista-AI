import {
  NextInterventionResponse,
  InterventionExecution,
  CompleteResponse,
  InterventionOutcome,
  InterventionProfile,
  HistoryItem
} from './types';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || 'http://localhost:4000';

async function request<T>(studentId: string, path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}/api${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${studentId}`,
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.error === 'string' ? body.error : `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getNextIntervention: (studentId: string) =>
    request<NextInterventionResponse>(studentId, `/students/${studentId}/next-intervention`),

  startIntervention: (studentId: string, decisionId: string) =>
    request<{ execution: InterventionExecution }>(studentId, `/students/${studentId}/interventions/${decisionId}/start`, {
      method: 'POST'
    }),

  completeIntervention: (studentId: string, executionId: string, result: { accuracyPct: number; questionsCompleted: number }) =>
    request<CompleteResponse>(studentId, `/students/${studentId}/interventions/${executionId}/complete`, {
      method: 'POST',
      body: JSON.stringify(result)
    }),

  retentionCheck: (studentId: string, executionId: string, body: { accuracyPct: number; daysAfter: number }) =>
    request<{ outcome: InterventionOutcome; profile: InterventionProfile }>(
      studentId,
      `/students/${studentId}/interventions/${executionId}/retention-check`,
      { method: 'POST', body: JSON.stringify(body) }
    ),

  getHistory: (studentId: string) => request<{ history: HistoryItem[] }>(studentId, `/students/${studentId}/intervention-history`),

  getProfile: (studentId: string) => request<{ profile: InterventionProfile | null }>(studentId, `/students/${studentId}/intervention-profile`)
};
