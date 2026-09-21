import { PositioningProfile } from "../types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

export interface ApiError {
  error: string;
  code?: string;
  retryable?: boolean;
}

async function request<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "x-student-id": "demo-student" }, // dev-mode stand-in for a real session; see backend/src/middleware/auth.ts
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: "Unknown error" }))) as ApiError;
    throw body;
  }
  return res.json() as Promise<T>;
}

export function getPositioning(studentId: string, roleId: string, opportunityId?: string): Promise<PositioningProfile> {
  const qs = new URLSearchParams({ roleId, ...(opportunityId ? { opportunityId } : {}) });
  return request<PositioningProfile>(`/api/students/${studentId}/positioning?${qs.toString()}`);
}
