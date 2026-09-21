import { EvidenceItem, JourneyEntry, ReadinessDTO, TargetRole } from '../types';

/**
 * Points at /api by default so the Vite dev proxy (see vite.config.ts)
 * forwards to the standalone backend on :4037. When this dashboard is
 * folded into ACEAPT's real frontend, point API_BASE at wherever
 * buildReadinessRouter() is actually mounted instead.
 */
const API_BASE = '/api/v1';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    credentials: 'include',
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(res.status, body.message ?? `Request failed with status ${res.status}`);
  }

  return res.json() as Promise<T>;
}

export const readinessClient = {
  listTargetRoles: (studentId: string) => request<{ roles: TargetRole[] }>(`/students/${studentId}/roles`),

  getRoleReadiness: (studentId: string, roleId: string) => request<ReadinessDTO>(`/students/${studentId}/readiness/${roleId}`),

  getOpportunityReadiness: (studentId: string, opportunityId: string) =>
    request<ReadinessDTO>(`/students/${studentId}/opportunities/${opportunityId}/readiness`),

  getReadinessJourney: (studentId: string, roleId: string) =>
    request<{ journey: JourneyEntry[] }>(`/students/${studentId}/readiness/${roleId}/journey`),

  getCapabilityEvidence: (studentId: string, roleId: string, capabilityId: string) =>
    request<{ evidence: EvidenceItem[] }>(`/students/${studentId}/readiness/${roleId}/capabilities/${capabilityId}/evidence`),
};
