"use client";

import {
  ActionType,
  AlertRecord,
  DeploymentRecord,
  EvaluationResult,
  HypothesisCategory,
  HypothesisRow,
  IncidentEventRow,
  IncidentInstance,
  IncidentTemplatePublic,
  MessageRow,
  MetricSeries,
  PostmortemRow,
} from "@/lib/engine/types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = await res.json();
  if (!res.ok) {
    const err = new Error(data?.message || `Request failed (${res.status})`) as Error & { payload?: unknown; status?: number };
    err.payload = data;
    err.status = res.status;
    throw err;
  }
  return data as T;
}

export function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

export const api = {
  listIncidents: () => request<{ incidents: IncidentInstance[] }>("/api/incidents"),
  createIncident: (templateSlug: string) =>
    request<{ incident: IncidentInstance; template: IncidentTemplatePublic }>("/api/incidents", {
      method: "POST",
      body: JSON.stringify({ templateSlug }),
    }),
  getIncident: (id: string) =>
    request<{ incident: IncidentInstance; template: IncidentTemplatePublic }>(`/api/incidents/${id}`),
  startIncident: (id: string) => request<{ incident: IncidentInstance }>(`/api/incidents/${id}/start`, { method: "POST" }),

  getMetrics: (id: string) => request<{ simMinutesElapsed: number; series: MetricSeries }>(`/api/incidents/${id}/metrics`),

  searchLogs: (id: string, q: URLSearchParams) =>
    request<{ total: number; page: number; pageSize: number; lines: unknown[] }>(`/api/incidents/${id}/logs?${q.toString()}`),

  listTraces: (id: string) =>
    request<{ traces: { traceKey: string; label: string; offsetSeconds: number; totalDurationMs: number; status: string; spanCount: number }[] }>(
      `/api/incidents/${id}/traces`
    ),
  getTrace: (id: string, traceKey: string) => request<{ trace: unknown }>(`/api/incidents/${id}/traces/${traceKey}`),

  listAlerts: (id: string) => request<{ alerts: AlertRecord[] }>(`/api/incidents/${id}/alerts`),
  listDeployments: (id: string) => request<{ deployments: DeploymentRecord[] }>(`/api/incidents/${id}/deployments`),

  listHypotheses: (id: string) => request<{ hypotheses: HypothesisRow[] }>(`/api/incidents/${id}/hypotheses`),
  createHypothesis: (
    id: string,
    body: { statement: string; category: HypothesisCategory; implicatedCauseKey: string; evidenceRefs: string[] }
  ) => request<{ hypothesis: HypothesisRow }>(`/api/incidents/${id}/hypotheses`, { method: "POST", body: JSON.stringify(body) }),
  updateHypothesis: (id: string, hypothesisId: string, status: "CONFIRMED" | "REJECTED", evidenceRefs?: string[]) =>
    request<{ hypothesis: HypothesisRow }>(`/api/incidents/${id}/hypotheses/${hypothesisId}`, {
      method: "PATCH",
      body: JSON.stringify({ status, evidenceRefs }),
    }),

  executeAction: (
    id: string,
    body: { actionType: ActionType; targetServiceKey?: string; confirmed?: boolean; idempotencyKey: string; evidenceKey?: string }
  ) =>
    request<{ incident: IncidentInstance; narrative: string; wasNew: boolean }>(`/api/incidents/${id}/actions`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  listMessages: (id: string) => request<{ messages: MessageRow[] }>(`/api/incidents/${id}/messages`),
  sendMessage: (
    id: string,
    body: { currentImpact: string; knownEvidence: string; hypothesis: string; mitigation: string; currentStatus: string; nextAction: string }
  ) => request<{ message: MessageRow }>(`/api/incidents/${id}/messages`, { method: "POST", body: JSON.stringify(body) }),

  listEvents: (id: string) => request<{ events: IncidentEventRow[] }>(`/api/incidents/${id}/events`),

  getPostmortem: (id: string) => request<{ postmortem: PostmortemRow | null }>(`/api/incidents/${id}/postmortem`),
  savePostmortemDraft: (id: string, body: Record<string, unknown>) =>
    request<{ postmortem: PostmortemRow }>(`/api/incidents/${id}/postmortem`, { method: "PUT", body: JSON.stringify(body) }),
  submitPostmortem: (id: string) => request<{ incident: IncidentInstance }>(`/api/incidents/${id}/submit`, { method: "POST" }),

  getEvaluation: (id: string) => request<{ evaluation: EvaluationResult | null }>(`/api/incidents/${id}/evaluation`),
  runEvaluation: (id: string) => request<{ evaluation: EvaluationResult }>(`/api/incidents/${id}/evaluation`, { method: "POST" }),
};
