import { useCallback, useEffect, useState } from 'react';
import {
  AlignmentResult,
  AlignmentSnapshot,
  CapabilityLevel,
  TargetPriorityEntry,
  WhatIfResult,
} from '../types/align.types';

/**
 * Thin fetch wrapper around the ALIGN API (src/api/routes/align.routes.ts on
 * the backend). Deliberately dependency-free (no react-query/swr) so these
 * components stay easy to drop into whatever the real ACEAPT frontend
 * already uses for data fetching — swap the guts of `request()` for your
 * existing API client if you have one.
 */
export function useAlignApi(baseUrl: string, getToken: () => string | null) {
  const request = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      const token = getToken();
      const res = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(init?.headers ?? {}),
        },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ? JSON.stringify(body.error) : `Request failed: ${res.status}`);
      }
      return res.json() as Promise<T>;
    },
    [baseUrl, getToken],
  );

  return {
    getDashboard: () =>
      request<{ results: AlignmentResult[]; shortlist: TargetPriorityEntry[]; awaitingEvidence: { targetId: string; targetName: string }[] }>(
        '/align',
      ),
    getTargetDetail: (targetId: string) =>
      request<{ result: AlignmentResult; explanation: { text: string; source: 'ai' | 'template' } }>(
        `/align/targets/${targetId}`,
      ),
    getHistory: (targetId: string) => request<{ history: AlignmentSnapshot[] }>(`/align/history?targetId=${targetId}`),
    recalculate: () => request<{ results: AlignmentResult[] }>('/align/recalculate', { method: 'POST' }),
    runScenario: (targetId: string, capabilityId: string, projectedLevel: CapabilityLevel) =>
      request<{ result: WhatIfResult }>('/align/scenario', {
        method: 'POST',
        body: JSON.stringify({ targetId, capabilityId, projectedLevel }),
      }).then((r) => r.result),
    improveGap: (targetId: string, capabilityId: string) =>
      request<{ ok: boolean }>(`/align/targets/${targetId}/improve-gap`, {
        method: 'POST',
        body: JSON.stringify({ capabilityId }),
      }),
    proveTarget: (targetId: string) =>
      request<{ ok: boolean }>(`/align/targets/${targetId}/prove`, { method: 'POST' }),
  };
}

/** Convenience hook for the dashboard screen's initial load. */
export function useAlignDashboard(api: ReturnType<typeof useAlignApi>) {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.getDashboard>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .getDashboard()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { data, loading, error };
}
