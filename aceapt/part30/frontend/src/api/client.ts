import type { EmptyStateResponse, PathDashboard, PathHistoryEvent, PathRisk, PathSnapshot, TargetComparison, WeeklyReview } from "../types";

const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4030/api/path";

export interface Identity {
  tenantId: string;
  studentId: string;
  label: string;
}

/**
 * Stand-in for real ACEAPT session identity (mirrors backend/src/middleware/auth.ts).
 * This reference build has no login of its own -- swap for the real
 * session/auth context when PATH's frontend lands in the live ACEAPT app.
 */
export const DEMO_IDENTITIES: Identity[] = [
  { tenantId: "d290f1ee-6c54-4b01-90e6-d701748f0851", studentId: "5a1e3b2c-1111-4a2b-9c3d-000000000001", label: "Ananya (Data Analyst)" },
  { tenantId: "d290f1ee-6c54-4b01-90e6-d701748f0851", studentId: "5a1e3b2c-1111-4a2b-9c3d-000000000002", label: "Rahul (Software Developer)" },
  { tenantId: "d290f1ee-6c54-4b01-90e6-d701748f0851", studentId: "5a1e3b2c-1111-4a2b-9c3d-000000000003", label: "Priya (no target yet)" },
];

export const DEMO_TARGETS = {
  dataAnalyst: "6b2f4c3d-2222-4a2b-9c3d-000000000010",
  softwareDeveloper: "6b2f4c3d-2222-4a2b-9c3d-000000000011",
  businessAnalyst: "6b2f4c3d-2222-4a2b-9c3d-000000000012",
};

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown
  ) {
    super(message);
  }
}

async function request<T>(identity: Identity, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-tenant-id": identity.tenantId,
      "x-student-id": identity.studentId,
      ...init?.headers,
    },
  });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json() : undefined;
  if (!res.ok) {
    throw new ApiError((body as { error?: string })?.error ?? `Request failed (${res.status})`, res.status, body);
  }
  return body as T;
}

export const pathApi = {
  current: (identity: Identity, targetId?: string) =>
    request<PathDashboard | EmptyStateResponse>(identity, targetId ? `/current?targetId=${targetId}` : "/current"),

  today: (identity: Identity, targetId: string) => request<{ actions: unknown[]; narrative: string }>(identity, `/today?targetId=${targetId}`),

  risks: (identity: Identity, targetId: string) => request<{ risks: PathRisk[] }>(identity, `/risks?targetId=${targetId}`),

  history: (identity: Identity, targetId: string) => request<{ snapshots: PathSnapshot[]; events: PathHistoryEvent[] }>(identity, `/history?targetId=${targetId}`),

  weeklyReview: (identity: Identity, targetId: string) => request<WeeklyReview>(identity, `/weekly-review?targetId=${targetId}`),

  selectTarget: (identity: Identity, targetId: string, slot: "PRIMARY" | "SECONDARY" | "STRETCH", deadlineDays?: number | null) =>
    request<{ dashboard: PathDashboard; comparison: TargetComparison | null }>(identity, "/target", {
      method: "POST",
      body: JSON.stringify({ targetId, slot, deadlineDays }),
    }),

  recalculate: (identity: Identity, targetId: string) =>
    request<PathDashboard>(identity, "/recalculate", { method: "POST", body: JSON.stringify({ targetId, reason: "MANUAL_RECALCULATION" }) }),

  completeAction: (identity: Identity, actionId: string, result: Record<string, unknown>) =>
    request<{ dashboard: PathDashboard; diagnosis: { cause: string; explanation: string } | null }>(identity, `/actions/${actionId}/complete`, {
      method: "POST",
      body: JSON.stringify({ result }),
    }),

  skipAction: (identity: Identity, actionId: string) =>
    request<{ dashboard: PathDashboard; consequence: string }>(identity, `/actions/${actionId}/skip`, { method: "POST" }),

  proveMilestone: (identity: Identity, milestoneId: string) =>
    request<{ dashboard: PathDashboard; proof: { passed: boolean; detail: string } }>(identity, `/milestones/${milestoneId}/prove`, { method: "POST" }),
};

export function isEmptyState(x: PathDashboard | EmptyStateResponse): x is EmptyStateResponse {
  return "empty" in x && x.empty === true;
}
