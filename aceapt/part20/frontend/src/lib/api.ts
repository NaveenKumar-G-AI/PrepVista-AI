import type {
  ClientQuestion,
  SessionInfo,
  ResponseState,
  ReportResponse,
  DrillChoice,
  MockHistoryEntry,
  SessionEvidence,
} from "./types";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) || "http://localhost:4020/api";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errBody.error || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  startSession: () => request<{ session: SessionInfo; questions: ClientQuestion[] }>("POST", "/sessions", {}),

  getSessionState: (id: string) =>
    request<{ session: SessionInfo; questions: ClientQuestion[]; responses: ResponseState[] }>(
      "GET",
      `/sessions/${id}`
    ),

  navigate: (
    id: string,
    body: { fromQuestionId: string | null; fromIndex: number | null; toQuestionId: string; toIndex: number; elapsedMs: number }
  ) => request<{ ok: true }>("POST", `/sessions/${id}/navigate`, body),

  answer: (id: string, questionId: string, selectedIndex: number) =>
    request<{ ok: true }>("POST", `/sessions/${id}/answer`, { questionId, selectedIndex }),

  clear: (id: string, questionId: string) => request<{ ok: true }>("POST", `/sessions/${id}/clear`, { questionId }),

  mark: (id: string, questionId: string, marked: boolean) =>
    request<{ ok: true }>("POST", `/sessions/${id}/mark`, { questionId, marked }),

  submit: (id: string, body: { finalQuestionId: string | null; finalElapsedMs: number }) =>
    request<{ evidence: SessionEvidence; expired: boolean }>("POST", `/sessions/${id}/submit`, body),

  getReport: (id: string) => request<ReportResponse>("GET", `/sessions/${id}/report`),

  coach: (id: string, promptKey: string) =>
    request<{ text: string; source: "ai" | "fallback" }>("POST", `/sessions/${id}/coach`, { promptKey }),

  startDrill: (id: string) =>
    request<{ drillChoice: DrillChoice; session: SessionInfo; questions: ClientQuestion[] }>(
      "POST",
      `/sessions/${id}/drill`,
      {}
    ),

  getImprovement: (id: string) =>
    request<{ drillLabel: string; drillEvidence: SessionEvidence; mainEvidence: SessionEvidence }>(
      "GET",
      `/sessions/${id}/improvement`
    ),

  getMockHistory: () => request<{ history: MockHistoryEntry[] }>("GET", "/mock-history"),
};
