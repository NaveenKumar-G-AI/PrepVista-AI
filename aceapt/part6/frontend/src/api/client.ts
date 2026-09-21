import type {
  AssessmentHistoryEntry,
  AssessmentStateResponse,
  AssessmentResult,
  AssessmentType,
  RecommendationResponse,
  Topic,
} from './types';

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:4000';
const STUDENT_ID_KEY = 'aceapt.studentId';

export function getStudentId(): string {
  const existing = localStorage.getItem(STUDENT_ID_KEY);
  if (existing) return existing;
  const generated = 'demo-student-1';
  localStorage.setItem(STUDENT_ID_KEY, generated);
  return generated;
}

export function setStudentId(id: string): void {
  localStorage.setItem(STUDENT_ID_KEY, id || 'demo-student-1');
}

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Student-Id': getStudentId(),
      ...options.headers,
    },
  });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json() : null;
  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? 'UNKNOWN_ERROR', body?.message ?? `Request failed (${res.status})`);
  }
  return body as T;
}

export const api = {
  createAssessment: (type: AssessmentType, focusTopics?: Topic[]) =>
    request<{ assessment: { id: string }; warnings: string[] }>('/api/assessments', {
      method: 'POST',
      body: JSON.stringify({ type, focusTopics }),
    }),

  getAssessment: (id: string) => request<AssessmentStateResponse>(`/api/assessments/${id}`),

  startAssessment: (id: string) => request<AssessmentStateResponse>(`/api/assessments/${id}/start`, { method: 'POST' }),

  navigate: (id: string, questionId: string) =>
    request<AssessmentStateResponse>(`/api/assessments/${id}/navigate`, {
      method: 'POST',
      body: JSON.stringify({ questionId }),
    }),

  submitAnswer: (id: string, questionId: string, optionId: string) =>
    request<AssessmentStateResponse>(`/api/assessments/${id}/attempt`, {
      method: 'POST',
      body: JSON.stringify({ questionId, optionId }),
    }),

  skip: (id: string, questionId: string) =>
    request<AssessmentStateResponse>(`/api/assessments/${id}/skip`, {
      method: 'POST',
      body: JSON.stringify({ questionId }),
    }),

  submitAssessment: (id: string) =>
    request<{ result: AssessmentResult; practiceSessionId: string | null }>(`/api/assessments/${id}/submit`, {
      method: 'POST',
    }),

  getResult: (id: string) => request<{ result: AssessmentResult }>(`/api/assessments/${id}/result`),

  getHistory: () => request<{ history: AssessmentHistoryEntry[] }>('/api/assessments/history'),

  getRecommendation: () => request<RecommendationResponse>('/api/assessments/recommendation'),

  completePractice: (practiceSessionId: string, accuracyPct: number, sampleSize: number) =>
    request<{ ok: true }>(`/api/practice-sessions/${practiceSessionId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ accuracyPct, sampleSize }),
    }),
};
