"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import Panel from "@/components/Panel";
import EmptyState from "@/components/EmptyState";
import StateBadge from "@/components/StateBadge";
import { planHealthDisplay, frictionDisplay } from "@/lib/presentation";
import type { PlanHealthState } from "@/lib/types";

interface HealthResponse {
  hasGoal: boolean;
  health?: { state: PlanHealthState; reasons: string[]; friction: string[] };
}

export default function HealthPage() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<HealthResponse>("/api/career/execution/health")
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="py-16 text-center text-sm text-ink-muted">Loading…</p>;
  if (!data?.hasGoal) return <EmptyState title="No plan yet" description="Set a career goal on the Today screen first." />;

  const health = data.health!;
  const display = planHealthDisplay(health.state);

  return (
    <div className="space-y-6">
      <div>
        <p className="font-display text-2xl font-semibold text-ink">Plan health</p>
        <p className="mt-1 text-sm text-ink-muted">A qualitative read of the plan, not a score.</p>
      </div>

      <Panel>
        <StateBadge label={display.label} tone={display.tone} />
        <p className="mt-3 text-sm text-ink">{display.description}</p>
        {health.reasons.length > 0 && (
          <ul className="mt-4 space-y-1.5 border-t border-hairline pt-4">
            {health.reasons.map((r, i) => (
              <li key={i} className="text-sm text-ink-muted">
                {r}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {health.friction.length > 0 && (
        <Panel>
          <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">Recurring friction</p>
          <ul className="mt-3 space-y-2">
            {health.friction.map((f, i) => (
              <li key={i} className="text-sm text-ink">
                {frictionDisplay(f)}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-faint">Future actions in these areas will be sized and framed differently to reduce this.</p>
        </Panel>
      )}
    </div>
  );
}
