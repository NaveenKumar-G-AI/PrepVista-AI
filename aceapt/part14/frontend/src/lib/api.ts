import { CheckQuestion, InterventionPlan, MasteryCheckBlueprint, MasteryTransition, Skill, SkillAnalysis, Student } from './types';

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) || 'http://localhost:4000/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export interface MasteryMapResponse {
  student: Student;
  domains: Array<{ domain: string; skills: Array<{ skill: Skill; analysis: SkillAnalysis }> }>;
}

export interface WhatDoIKnowResponse {
  student: Student;
  buckets: Record<string, Array<{ skill: Skill; analysis: SkillAnalysis }>>;
}

export const api = {
  getMasteryMap: (studentId: string) => request<MasteryMapResponse>(`/students/${studentId}/mastery-map`),

  getWhatDoIKnow: (studentId: string) => request<WhatDoIKnowResponse>(`/students/${studentId}/what-do-i-know`),

  getSkillDetail: (studentId: string, skillId: string) =>
    request<{ skill: Skill; analysis: SkillAnalysis; explanation: string }>(`/students/${studentId}/skills/${skillId}`),

  getSkillHistory: (studentId: string, skillId: string) =>
    request<{ transitions: MasteryTransition[]; snapshots: any[] }>(`/students/${studentId}/skills/${skillId}/history`),

  getBottlenecks: (studentId: string) =>
    request<{ bottlenecks: Array<{ skillId: string; skillName: string; dependentCount: number; isCurrentlyWeak: boolean }> }>(
      `/students/${studentId}/bottlenecks`
    ),

  getReadiness: (studentId: string) =>
    request<{ signals: Array<{ skillId: string; skillName: string; eligibleForMixedAssessment: boolean; reason: string }> }>(
      `/students/${studentId}/readiness`
    ),

  intervene: (studentId: string, skillId: string) =>
    request<{ plan: InterventionPlan }>(`/students/${studentId}/skills/${skillId}/intervene`, { method: 'POST' }),

  createMasteryCheck: (studentId: string, skillId: string) =>
    request<{ check: { id: string; blueprint: MasteryCheckBlueprint }; questions: CheckQuestion[] }>(`/mastery-checks`, {
      method: 'POST',
      body: JSON.stringify({ studentId, skillId }),
    }),

  submitAnswer: (checkId: string, questionId: string, answer: string, hintUsed: boolean, retries: number, responseTimeMs: number) =>
    request<{ correct: boolean; correctAnswer: string }>(`/mastery-checks/${checkId}/answers`, {
      method: 'POST',
      body: JSON.stringify({ questionId, answer, hintUsed, retries, responseTimeMs }),
    }),

  completeMasteryCheck: (checkId: string) =>
    request<{ before: SkillAnalysis; after: SkillAnalysis; explanation: string; intervention: InterventionPlan | null; stateChanged: boolean }>(
      `/mastery-checks/${checkId}/complete`,
      { method: 'POST' }
    ),
};
