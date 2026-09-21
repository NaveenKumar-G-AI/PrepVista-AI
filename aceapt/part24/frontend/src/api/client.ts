import type {
  MemoryProfile,
  MemoryPrioritiesResult,
  RecoveryRecommendation,
  RecoveryResultResponse,
  DelayedVerificationResponse,
  SkillMeta,
} from '../types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Request to ${path} failed (${res.status}): ${body}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<{ ok: boolean; aiConfigured: boolean; demoStudentId: string }>('/health'),

  listSkills: () => request<SkillMeta[]>('/api/recall/skills'),

  getMemoryProfile: (studentId: string) => request<MemoryProfile>(`/api/recall/memory-profile/${studentId}`),

  getMemoryPriorities: (studentId: string) => request<MemoryPrioritiesResult>(`/api/recall/memory-priorities/${studentId}`),

  getRecoveryRecommendation: (studentId: string, skillId: string) =>
    request<RecoveryRecommendation>(`/api/recall/recovery-recommendation/${studentId}/${skillId}`),

  submitRecoveryResult: (studentId: string, sessionId: string, answers: { questionId: string; selectedOptionId: string }[]) =>
    request<RecoveryResultResponse>('/api/recall/recovery-result', {
      method: 'POST',
      body: JSON.stringify({ studentId, sessionId, answers }),
    }),

  submitDelayedVerification: (
    studentId: string,
    sessionId: string,
    answers: { questionId: string; selectedOptionId: string }[],
    simulatedDaysLater?: number,
  ) =>
    request<DelayedVerificationResponse>('/api/recall/delayed-verification', {
      method: 'POST',
      body: JSON.stringify({ studentId, sessionId, answers, simulatedDaysLater }),
    }),
};

export const DEMO_STUDENT_ID = 'student_demo_1';
