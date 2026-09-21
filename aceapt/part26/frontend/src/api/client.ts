import type {
  AdaptationEvent,
  CompleteActionResponse,
  NextActionResponse,
  PlanResponse,
  StartActionResponse,
  TopicCapabilityState
} from "../types";

// Same-origin in dev thanks to the Vite proxy (vite.config.ts) - no CORS,
// no base URL to configure. In production, point this at wherever the
// Express API is deployed.
const BASE = "/api";

// Placeholder student id (see backend/src/middleware/studentContext.ts).
// Swap for a real signed-in user id once this is wired into PrepVista's
// actual auth.
const STUDENT_ID = "demo-student";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-student-id": STUDENT_ID,
      ...(init?.headers ?? {})
    }
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getCapabilityState: () =>
    request<{ topics: TopicCapabilityState[] }>("/capability-state"),

  getNextAction: () => request<NextActionResponse>("/next-action"),

  getAdaptivePlan: (minutes: number, reset = false) =>
    request<PlanResponse>(`/adaptive-plan?minutes=${minutes}&reset=${reset}`),

  startAction: (candidateActionId: string) =>
    request<StartActionResponse>("/action/start", {
      method: "POST",
      body: JSON.stringify({ candidateActionId })
    }),

  completeAction: (
    executionId: string,
    answers: { itemId: string; selectedIndex: number; responseTimeSeconds: number }[]
  ) =>
    request<CompleteActionResponse>("/action/complete", {
      method: "POST",
      body: JSON.stringify({ executionId, answers })
    }),

  skipAction: (candidateActionId: string) =>
    request<{ next: NextActionResponse; plan: PlanResponse | null }>("/action/skip", {
      method: "POST",
      body: JSON.stringify({ candidateActionId })
    }),

  getHistory: () => request<{ events: AdaptationEvent[] }>("/adaptation-history"),

  resetDemo: () => request<{ ok: boolean }>("/demo/reset", { method: "POST" })
};
