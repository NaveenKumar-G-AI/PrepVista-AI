"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import Panel from "@/components/Panel";
import EmptyState from "@/components/EmptyState";
import StateBadge from "@/components/StateBadge";
import { trendDisplay, planHealthDisplay } from "@/lib/presentation";
import type { PlanHealthState, CapabilityTrend } from "@/lib/types";

interface ChangesResponse {
  hasGoal: boolean;
  capabilityChanges?: { name: string; trend: CapabilityTrend; isBottleneck: boolean }[];
  adjustments?: { reason: string; description: string; createdAt: string }[];
  planHealth?: { state: PlanHealthState; reasons: string[] };
}

export default function ChangedPage() {
  const [data, setData] = useState<ChangesResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<ChangesResponse>("/api/career/execution/changes")
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="py-16 text-center text-sm text-ink-muted">Loading…</p>;
  if (!data?.hasGoal) return <EmptyState title="No plan yet" description="Set a career goal on the Today screen first." />;

  const { capabilityChanges = [], adjustments = [], planHealth } = data;

  return (
    <div className="space-y-6">
      <div>
        <p className="font-display text-2xl font-semibold text-ink">What changed?</p>
        <p className="mt-1 text-sm text-ink-muted">A plain read of what moved, and why the plan adjusted around it.</p>
      </div>

      <Panel>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">Capability signal</p>
        {capabilityChanges.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">No capability areas yet.</p>
        ) : (
          <div className="mt-3 space-y-2.5">
            {capabilityChanges.map((c) => (
              <div key={c.name} className="flex items-center justify-between">
                <span className="text-sm text-ink">
                  {c.name}
                  {c.isBottleneck && <span className="ml-2 text-xs text-brass-strong">· current bottleneck</span>}
                </span>
                <StateBadge {...trendDisplay(c.trend)} />
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">Plan adjustments</p>
        {adjustments.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">No adjustments recorded recently.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {adjustments.map((a, i) => (
              <li key={i} className="text-sm text-ink-muted">
                <span className="tnum text-xs text-ink-faint">
                  {new Date(a.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                </span>{" "}
                — {a.description}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {planHealth && (
        <Panel>
          <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">Plan health</p>
          <div className="mt-2">
            <StateBadge {...planHealthDisplay(planHealth.state)} />
          </div>
          <ul className="mt-2 space-y-1">
            {planHealth.reasons.map((r, i) => (
              <li key={i} className="text-xs text-ink-muted">
                {r}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
