import type { ApiError, ReadinessEvent, ReadinessState, RoleOption } from "../types";

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) || "http://localhost:4000/api/readiness-radar";

/**
 * INTEGRATION POINT — not real auth.
 *
 * There's no ACEAPT session to read a student id from in this standalone
 * build, so this keeps one in localStorage for continuity across visits.
 * Swap this for the real logged-in student id once this ships inside
 * ACEAPT, and delete the localStorage fallback.
 */
export function getCurrentStudentId(): string {
  const key = "aceapt_demo_student_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = "demo-student-1"; // matches backend/src/seed.ts
    localStorage.setItem(key, id);
  }
  return id;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-student-id": getCurrentStudentId(),
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: string } };
    const err = new Error(body.error?.message ?? `Request failed (${res.status})`) as ApiError;
    err.status = res.status;
    err.code = body.error?.code;
    throw err;
  }
  return (await res.json()) as T;
}

export const api = {
  getRoles: () => request<{ roles: RoleOption[] }>("/roles"),
  getState: () => request<ReadinessState>("/state"),
  getEvents: () => request<{ events: ReadinessEvent[] }>("/events"),
  setTargetRole: (roleId: string) =>
    request<ReadinessState>("/target-role", { method: "POST", body: JSON.stringify({ roleId }) }),
  submitAssessment: (capabilityId: string, score: number, source?: string) =>
    request<ReadinessState>("/assessment-attempts", {
      method: "POST",
      body: JSON.stringify({ capabilityId, score, source }),
    }),
  completeRecommendation: (id: string, resultScore?: number) =>
    request<ReadinessState>(`/recommendations/${encodeURIComponent(id)}/complete`, {
      method: "POST",
      body: JSON.stringify({ resultScore }),
    }),
  skipRecommendation: (id: string, reason?: string) =>
    request<ReadinessState>(`/recommendations/${encodeURIComponent(id)}/skip`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
};
