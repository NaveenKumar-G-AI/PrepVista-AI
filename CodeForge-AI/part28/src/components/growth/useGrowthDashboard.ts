import { useCallback, useEffect, useState } from "react";
import type { GrowthSnapshot, GrowthInsight, GrowthMilestone, GrowthDimension } from "../../lib/growth/types.ts";

export interface UseGrowthDashboardResult {
  snapshot: GrowthSnapshot | null;
  insights: GrowthInsight[];
  milestones: GrowthMilestone[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Reference implementation only. `GrowthDashboard` itself takes plain data
 * as props and has no fetch logic of its own — swap this hook for however
 * your app already does data-fetching (React Query, SWR, a server
 * component loader, ...) rather than adopting this file verbatim.
 */
export function useGrowthDashboard(apiBaseUrl: string, authToken: string, options?: { studentId?: string; assessmentMode?: boolean }): UseGrowthDashboardResult {
  const [snapshot, setSnapshot] = useState<GrowthSnapshot | null>(null);
  const [insights, setInsights] = useState<GrowthInsight[]>([]);
  const [milestones, setMilestones] = useState<GrowthMilestone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams();
    if (options?.studentId) qs.set("studentId", options.studentId);
    if (options?.assessmentMode) qs.set("mode", "assessment");
    const headers = { Authorization: `Bearer ${authToken}` };

    try {
      const [snapshotRes, insightsRes, milestonesRes] = await Promise.all([
        fetch(`${apiBaseUrl}/api/growth/snapshot?${qs}`, { headers }),
        fetch(`${apiBaseUrl}/api/growth/insights?${qs}`, { headers }),
        fetch(`${apiBaseUrl}/api/growth/milestones?${qs}`, { headers }),
      ]);
      if (snapshotRes.status === 404) {
        setSnapshot(null);
      } else if (!snapshotRes.ok) {
        throw new Error(`snapshot request failed (${snapshotRes.status})`);
      } else {
        setSnapshot(await snapshotRes.json());
      }
      if (!insightsRes.ok) throw new Error(`insights request failed (${insightsRes.status})`);
      if (!milestonesRes.ok) throw new Error(`milestones request failed (${milestonesRes.status})`);
      setInsights(await insightsRes.json());
      setMilestones(await milestonesRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error loading growth data");
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, authToken, options?.studentId, options?.assessmentMode]);

  useEffect(() => {
    load();
  }, [load, refreshToken]);

  return { snapshot, insights, milestones, loading, error, refresh: () => setRefreshToken((n) => n + 1) };
}

export type { GrowthDimension };
