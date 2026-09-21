import type { GoalDraft, GoalMilestone, GoalView } from "../types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4044/api";

// Dev-mode auth only (see ../../src/middleware/auth.ts) - swap for a
// real bearer token once this integrates with ACEAPT's real auth flow.
function headers(studentId: string): HeadersInit {
  return { "content-type": "application/json", "x-student-id": studentId };
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  extractGoal: (studentId: string, text: string): Promise<GoalDraft> =>
    fetch(`${BASE_URL}/goals/extract`, { method: "POST", headers: headers(studentId), body: JSON.stringify({ text }) }).then((r) =>
      unwrap(r)
    ),

  createGoal: (studentId: string, payload: Record<string, unknown>): Promise<GoalView> =>
    fetch(`${BASE_URL}/goals`, { method: "POST", headers: headers(studentId), body: JSON.stringify(payload) }).then((r) => unwrap(r)),

  listGoals: (studentId: string) =>
    fetch(`${BASE_URL}/goals`, { headers: headers(studentId) }).then((r) => unwrap<{ goals: GoalView["goal"][] }>(r)),

  getGoal: (studentId: string, goalId: string): Promise<GoalView> =>
    fetch(`${BASE_URL}/goals/${goalId}`, { headers: headers(studentId) }).then((r) => unwrap(r)),

  recalculate: (studentId: string, goalId: string): Promise<GoalView> =>
    fetch(`${BASE_URL}/goals/${goalId}/recalculate`, { method: "POST", headers: headers(studentId) }).then((r) => unwrap(r)),

  pause: (studentId: string, goalId: string) =>
    fetch(`${BASE_URL}/goals/${goalId}/pause`, { method: "POST", headers: headers(studentId) }).then((r) => unwrap(r)),

  resume: (studentId: string, goalId: string): Promise<GoalView> =>
    fetch(`${BASE_URL}/goals/${goalId}/resume`, { method: "POST", headers: headers(studentId) }).then((r) => unwrap(r)),

  markComplete: (studentId: string, goalId: string) =>
    fetch(`${BASE_URL}/goals/${goalId}/complete`, { method: "POST", headers: headers(studentId) }).then((r) => unwrap(r)),

  getMilestones: (studentId: string, goalId: string) =>
    fetch(`${BASE_URL}/goals/${goalId}/milestones`, { headers: headers(studentId) }).then((r) => unwrap<{ milestones: GoalMilestone[] }>(r)),

  getExplanation: (studentId: string, goalId: string) =>
    fetch(`${BASE_URL}/goals/${goalId}/explanation`, { headers: headers(studentId) }).then((r) =>
      unwrap<{ explanation: string; source: string }>(r)
    ),
};
