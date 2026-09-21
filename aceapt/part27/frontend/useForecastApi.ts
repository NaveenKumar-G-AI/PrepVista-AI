import { useCallback, useEffect, useState } from "react";
import type { ForecastScreenData, InterventionPlan } from "./types.js";

export interface UseForecastApiOptions {
  studentId: string;
  /** e.g. "/api/v1" behind your app's proxy, or a full origin in dev. */
  baseUrl?: string;
  /** Wire your app's real auth (bearer token, cookies-via-credentials, etc.) here. */
  authHeaders?: Record<string, string>;
}

export interface UseForecastApiResult {
  data: ForecastScreenData | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  fixMyReadiness: () => Promise<InterventionPlan | null>;
  fixingReadiness: boolean;
}

/**
 * Illustrative only — if your app already has a data-fetching layer (React
 * Query, SWR, a generated client), wire <ForecastScreen> to that instead. The
 * components only need a ForecastScreenData object as a prop; they don't
 * care how it was fetched.
 */
export function useForecastApi({ studentId, baseUrl = "/api/v1", authHeaders = {} }: UseForecastApiOptions): UseForecastApiResult {
  const [data, setData] = useState<ForecastScreenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fixingReadiness, setFixingReadiness] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const headers = { "content-type": "application/json", ...authHeaders };

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [readinessRes, forecastRes, risksRes, trajectoryRes] = await Promise.all([
          fetch(`${baseUrl}/students/${studentId}/readiness`, { headers }),
          fetch(`${baseUrl}/students/${studentId}/forecast`, { headers }),
          fetch(`${baseUrl}/students/${studentId}/risks`, { headers }),
          fetch(`${baseUrl}/students/${studentId}/trajectory`, { headers }),
        ]);
        if (!readinessRes.ok || !forecastRes.ok || !risksRes.ok || !trajectoryRes.ok) {
          throw new Error("One or more forecast endpoints returned an error.");
        }
        const [readiness, forecastBody, risksBody, trajectoryBody] = await Promise.all([
          readinessRes.json(),
          forecastRes.json(),
          risksRes.json(),
          trajectoryRes.json(),
        ]);
        if (cancelled) return;
        setData({
          readiness,
          forecast: forecastBody.forecast ?? null,
          overallTrend: trajectoryBody.overallTrend,
          risks: risksBody.risks ?? [],
          mainFactor: risksBody.mainFactor ?? null,
          whyPanel: risksBody.whyPanel ?? null,
          whyNarrative: risksBody.whyNarrative ?? null,
          roadmap: risksBody.roadmap ?? [],
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load forecast.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
    // authHeaders is intentionally excluded — pass a stable reference from
    // the caller (e.g. useMemo) if it depends on a refreshing token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, baseUrl, reloadToken]);

  const refresh = useCallback(() => setReloadToken((t) => t + 1), []);

  const fixMyReadiness = useCallback(async (): Promise<InterventionPlan | null> => {
    setFixingReadiness(true);
    try {
      const headers = { "content-type": "application/json", ...authHeaders };
      const res = await fetch(`${baseUrl}/students/${studentId}/fix-my-readiness`, { method: "POST", headers });
      if (!res.ok) throw new Error("Failed to generate a plan.");
      const body = await res.json();
      return body.plan ?? null;
    } finally {
      setFixingReadiness(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, baseUrl]);

  return { data, loading, error, refresh, fixMyReadiness, fixingReadiness };
}
