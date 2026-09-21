const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4040';

/** STAND-IN AUTH: the backend's own stand-in auth (src/middleware/auth.ts on
 * the server) reads this header directly. Swap this for real session/JWT
 * handling together with that file when integrating into the real ACEAPT
 * frontend shell -- nothing else in this client needs to change since every
 * call already goes through this one function. */
function studentId(): string {
  return localStorageSafeGet('feature40_student_id') || '';
}

function localStorageSafeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setStudentId(id: string) {
  try {
    window.localStorage.setItem('feature40_student_id', id);
  } catch {
    /* ignore -- storage may be unavailable */
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Student-Id': studentId(),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export const api = {
  getCareerHorizon: (period?: string) => request<any>(`/api/career-horizon${period ? `?period=${period}` : ''}`),
  recomputeFutureGaps: (roleId: string, period: string) =>
    request<any>(`/api/future-gaps/recompute?roleId=${roleId}&period=${period}`, { method: 'POST' }),
  getCareerPaths: (roleId: string, period: string) => request<any>(`/api/career-paths?roleId=${roleId}&period=${period}`),
  compareCareerPaths: (roleIds: string[], period: string) =>
    request<any>(`/api/career-paths/compare?roleIds=${roleIds.join(',')}&period=${period}`),
  createScenario: (roleId: string, scenarioType: string) =>
    request<any>('/api/career-scenarios', { method: 'POST', body: JSON.stringify({ roleId, scenarioType }) }),
  listScenarios: () => request<any>('/api/career-scenarios'),
  startExperiment: (roleId: string) => request<any>('/api/career-experiments', { method: 'POST', body: JSON.stringify({ roleId }) }),
  completeExperiment: (id: string, reflection: string, interestRating: number, difficultyRating: number) =>
    request<any>(`/api/career-experiments/${id}/complete`, {
      method: 'POST',
      body: JSON.stringify({ reflection, interestRating, difficultyRating }),
    }),
  listExperiments: () => request<any>('/api/career-experiments'),
  dailySignal: () => request<any>('/api/market-brief/daily'),
  weeklyBrief: () => request<any>('/api/market-brief/weekly'),
  technologyAnalysis: (technologyName: string, roleId?: string) =>
    request<any>('/api/technology-analysis', { method: 'POST', body: JSON.stringify({ technologyName, roleId }) }),
};
