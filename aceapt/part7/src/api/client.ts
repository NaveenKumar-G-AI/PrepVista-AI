import type {
  StudentAction,
  PriorityBoardData,
  PlannedItem,
  ReadinessGap,
  Milestone,
  ProgressPoint,
  StudentSummary,
} from '../types';

const BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4007/api';
export const STUDENT_ID = import.meta.env.VITE_STUDENT_ID || 'demo-student-01';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${options?.method || 'GET'} ${path} → ${res.status} ${body}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  summary: () => request<StudentSummary>(`/students/${STUDENT_ID}/summary`),

  nextBestAction: () =>
    request<{ action: StudentAction | null; message?: string }>(`/students/${STUDENT_ID}/next-best-action`),

  priorities: () => request<PriorityBoardData>(`/students/${STUDENT_ID}/priorities`),

  actionPlan: (minutes: number) =>
    request<{ minutes_available: number; plan: PlannedItem[] }>(
      `/students/${STUDENT_ID}/action-plan?minutes=${minutes}`
    ),

  startAction: (id: string) => request<{ action: StudentAction }>(`/actions/${id}/start`, { method: 'POST' }),

  completeAction: (id: string, before: Record<string, number>, after: Record<string, number>) =>
    request<{ outcome: unknown }>(`/actions/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify({ before_metrics: before, after_metrics: after }),
    }),

  skipAction: (id: string, reason?: string) =>
    request<{ action: StudentAction }>(`/actions/${id}/skip`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  readinessGap: () => request<ReadinessGap>(`/students/${STUDENT_ID}/readiness-gap`),

  milestones: () => request<{ milestones: Milestone[] }>(`/students/${STUDENT_ID}/milestones`),

  progressStory: () => request<{ story: ProgressPoint[] }>(`/students/${STUDENT_ID}/progress-story`),
};
