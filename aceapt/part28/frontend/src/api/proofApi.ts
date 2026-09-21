import type {
  ProofStatus, ProofSnapshot, StartVerificationResponse, CompleteVerificationResponse, EvidenceSummary,
} from './types.js';
import type { VerificationEvidence } from './types.js';

// Base URL and auth token are injected by the host app (PrepVista's existing
// API layer/auth) — this client deliberately knows nothing about how
// authentication actually works, matching Section 47 (reuse the existing
// auth layer rather than reimplementing it here).
export interface ProofApiConfig {
  baseUrl: string;
  getAuthHeader: () => string;
}

async function request<T>(config: ProofApiConfig, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      authorization: config.getAuthHeader(),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error?.message ?? body.error ?? `PROOF API error (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const proofApi = {
  getStatus: (config: ProofApiConfig, targetId: string) =>
    request<ProofStatus>(config, `/proof/status?targetId=${encodeURIComponent(targetId)}`),

  getEvidence: (config: ProofApiConfig, capability?: string) =>
    request<{ evidence: VerificationEvidence[]; summary: EvidenceSummary }>(
      config, `/proof/evidence${capability ? `?capability=${encodeURIComponent(capability)}` : ''}`,
    ),

  getHistory: (config: ProofApiConfig, targetId: string) =>
    request<{ history: ProofSnapshot[] }>(config, `/proof/history?targetId=${encodeURIComponent(targetId)}`),

  start: (config: ProofApiConfig, targetId: string) =>
    request<StartVerificationResponse>(config, '/proof/start', {
      method: 'POST', body: JSON.stringify({ targetId }),
    }),

  respond: (config: ProofApiConfig, body: {
    sessionId: string; questionIndex: number; capability: string; difficulty: string; novelty: string;
    isCorrect: boolean; timeTakenMs: number; expectedTimeMs: number; skipped?: boolean; changedAnswer?: boolean; stalled?: boolean;
  }) => request<{ ok: true }>(config, '/proof/response', { method: 'POST', body: JSON.stringify(body) }),

  complete: (config: ProofApiConfig, sessionId: string) =>
    request<CompleteVerificationResponse>(config, '/proof/complete', {
      method: 'POST', body: JSON.stringify({ sessionId }),
    }),

  recalculate: (config: ProofApiConfig, targetId: string, capability: string) =>
    request<{ status: string }>(config, '/proof/recalculate', {
      method: 'POST', body: JSON.stringify({ targetId, capability }),
    }),
};
