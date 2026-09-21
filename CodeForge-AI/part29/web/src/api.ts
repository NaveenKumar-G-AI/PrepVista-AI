export interface GrowthOrUnavailable {
  unavailable?: true;
  reason?: string;
  absoluteChange?: number;
  relativeChange?: number | null;
  confidence?: string;
  evidenceCount?: number;
}

export interface SkillSummary {
  skillId: string;
  skillKey: string;
  skillName: string;
  currentValue: number;
  currentConfidence: string;
  evidenceCount: number;
  lastObservedAt: string;
  growth: GrowthOrUnavailable;
  trend: { label: string; velocityPerWeek?: number };
}

export interface OverviewResponse {
  studentId: string;
  overallGrowth: { value: number; skillsIncluded: number } | { unavailable: true; reason: string };
  skills: SkillSummary[];
  recentMilestones: { type: string; achieved_at: string; description: string; skill_name: string }[];
  recentEvents: { event_type: string; payload: any; created_at: string }[];
}

export interface SnapshotPoint {
  value: string | number;
  observed_at: string;
}

function authHeaders(userId: string, role: string): HeadersInit {
  return { "x-user-id": userId, "x-user-role": role };
}

async function get<T>(path: string, userId: string, role: string): Promise<T> {
  const res = await fetch(`/api${path}`, { headers: authHeaders(userId, role) });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? body.error ?? `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  overview: (studentId: string, userId: string, role: string) =>
    get<OverviewResponse>(`/students/${studentId}/growth/overview`, userId, role),
  snapshots: (studentId: string, skillId: string, userId: string, role: string) =>
    get<{ snapshots: SnapshotPoint[] }>(`/students/${studentId}/growth/snapshots?skillId=${skillId}`, userId, role),
  timeline: (studentId: string, userId: string, role: string) =>
    get<{ events: any[] }>(`/students/${studentId}/growth/timeline`, userId, role),
  cohortOverview: (cohortId: string, userId: string, role: string) =>
    get<any>(`/cohorts/${cohortId}/growth/overview`, userId, role),
};
