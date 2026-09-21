import type { GraphSkill, GraphVersionSummary, PrioritySignal, RelatedEdge, RootCauseSignal, StudentSkillView, ValidationReport } from './types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4045/api';

export class ApiClientError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiClientError(res.status, body.message ?? `Request to ${path} failed with ${res.status}`);
  }
  return res.json() as Promise<T>;
}

/**
 * `token` here is "userId:role" or "userId:role:institutionId", matching
 * the backend's stub bearer scheme (service/src/api/middleware/auth.middleware.ts).
 * Replace with real session/JWT handling once ACEAPT's auth is wired in —
 * everything below this line is unaffected by that swap.
 */
export function createSkillGraphClient(token: string) {
  return {
    listSkills: (domain?: string) => request<{ count: number; skills: GraphSkill[] }>(`/skill-graph${domain ? `?domain=${domain}` : ''}`, token),
    getSkill: (idOrCode: string) => request<{ skill: GraphSkill }>(`/skill-graph/${idOrCode}`, token),
    getPrerequisites: (idOrCode: string) => request<{ skill: SkillRefLike; prerequisites: RelatedEdge[] }>(`/skill-graph/${idOrCode}/prerequisites`, token),
    getDependents: (idOrCode: string) => request<{ skill: SkillRefLike; dependents: RelatedEdge[] }>(`/skill-graph/${idOrCode}/dependents`, token),
    getRelated: (idOrCode: string) => request<{ skill: SkillRefLike; related: RelatedEdge[] }>(`/skill-graph/${idOrCode}/related`, token),

    getStudentGraph: (studentId: string, domain?: string) => request<{ studentId: string; count: number; skills: StudentSkillView[] }>(`/students/${studentId}/skill-graph${domain ? `?domain=${domain}` : ''}`, token),
    getStudentGaps: (studentId: string) => request<{ gaps: StudentSkillView[] }>(`/students/${studentId}/skill-graph/gaps`, token),
    getStudentPriorities: (studentId: string) => request<{ goal: { id: string; label: string } | null; priorities: PrioritySignal[] }>(`/students/${studentId}/skill-graph/priorities`, token),
    getStudentCoverage: (studentId: string, goalScoped = true) => request<{ coverage: Record<string, number> }>(`/students/${studentId}/skill-graph/coverage?goalScoped=${goalScoped}`, token),
    getRootCause: (studentId: string, skillCode: string) => request<RootCauseSignal>(`/students/${studentId}/skill-graph/root-cause/${skillCode}`, token),

    getCohort: (institutionId: string) => request<{ distribution: Array<{ skillCode: string; displayName: string; domain: string; distribution: Record<string, number>; sampleSize: number; cohortSize: number }> }>(`/institutions/${institutionId}/skill-graph/cohort`, token),

    adminValidate: () => request<ValidationReport>(`/admin/skill-graph/validate`, token, { method: 'POST' }),
    adminPublish: () => request<{ published: boolean; report: ValidationReport }>(`/admin/skill-graph/publish`, token, { method: 'POST' }),
    adminListVersions: () => request<{ versions: GraphVersionSummary[] }>(`/admin/skill-graph/versions`, token),
  };
}

interface SkillRefLike {
  id: string;
  code: string;
  displayName: string;
}
