import type { TechnicalMasteryReportDto, ViewableReport } from "../types/report";

/**
 * Points at the Feature 38 API from server/src/http/routes-reports.ts.
 * Swap `authHeader` for however the real app attaches its session/JWT.
 */
export interface ReportApiConfig {
  baseUrl: string;
  authHeader: () => string;
}

async function request<T>(config: ReportApiConfig, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      authorization: config.authHeader(),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed with ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function createReportApi(config: ReportApiConfig) {
  return {
    requestReport: (studentId: string) =>
      request<{ reportId: string; status: string; reused: boolean }>(config, "/api/reports", {
        method: "POST",
        body: JSON.stringify({ studentId }),
      }),

    getReport: (reportId: string) => request<ViewableReport>(config, `/api/reports/${reportId}`),

    getReportStatus: (reportId: string) =>
      request<{ status: string; freshness: string }>(config, `/api/reports/${reportId}/status`),

    getReportHistory: (studentId: string) =>
      request<
        { reportId: string; status: string; sourceDataVersion: number; schemaVersion: string; generatedAt: string | null; createdAt: string }[]
      >(config, `/api/students/${studentId}/reports`),

    refreshReport: (reportId: string) =>
      request<{ reportId: string; status: string }>(config, `/api/reports/${reportId}/refresh`, { method: "POST" }),

    exportPdfUrl: (reportId: string) => `${config.baseUrl}/api/reports/${reportId}/export.pdf`,
  };
}

export type { TechnicalMasteryReportDto, ViewableReport };
