"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import Panel from "@/components/Panel";
import EmptyState from "@/components/EmptyState";
import ActionRow from "@/components/ActionRow";
import StateBadge from "@/components/StateBadge";
import { trendDisplay } from "@/lib/presentation";
import type { ActionItem, CareerGoal, CapabilityArea, Milestone, WeeklyObjective } from "@/lib/types";

interface PlanResponse {
  hasGoal: boolean;
  goal?: CareerGoal;
  milestones?: Milestone[];
  activeMilestone?: Milestone | null;
  weeklyObjective?: WeeklyObjective | null;
  capabilities?: CapabilityArea[];
  candidates?: ActionItem[];
  inProgress?: ActionItem[];
  recentlyCompleted?: ActionItem[];
  adjustments?: { reason: string; description: string; createdAt: string }[];
}

export default function PlanPage() {
  const [data, setData] = useState<PlanResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setData(await apiGet<PlanResponse>("/api/career/execution/plan"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <p className="py-16 text-center text-sm text-ink-muted">Loading your plan…</p>;
  if (!data?.hasGoal) {
    return <EmptyState title="No plan yet" description="Set a career goal on the Today screen to generate your live plan." />;
  }

  const { goal, milestones = [], weeklyObjective, capabilities = [], candidates = [], inProgress = [], recentlyCompleted = [], adjustments = [] } = data;

  return (
    <div className="space-y-6">
      <div>
        <p className="font-display text-2xl font-semibold text-ink">Live Career Plan</p>
        <p className="mt-1 text-sm text-ink-muted">{goal?.targetRole} — this adjusts continuously as evidence comes in, not a fixed schedule.</p>
      </div>

      <Panel>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">Milestones</p>
        <ol className="mt-3 space-y-3">
          {milestones.map((m, i) => (
            <li key={m.id} className="flex items-center gap-3">
              <span className={`tnum flex h-6 w-6 flex-none items-center justify-center rounded-full border text-xs ${
                m.status === "ACTIVE" ? "border-brass bg-brass-soft text-brass-strong" : "border-hairline text-ink-faint"
              }`}>
                {i + 1}
              </span>
              <span className={`text-sm ${m.status === "ACTIVE" ? "font-medium text-ink" : "text-ink-muted"}`}>{m.title}</span>
              {m.status === "DONE" && <StateBadge label="Done" tone="sage" />}
            </li>
          ))}
        </ol>
        {weeklyObjective && (
          <div className="mt-4 border-t border-hairline pt-4">
            <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">This week&apos;s objective</p>
            <p className="mt-1 text-sm text-ink">{weeklyObjective.title}</p>
          </div>
        )}
      </Panel>

      <Panel>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">Capability areas</p>
        <div className="mt-3 space-y-2.5">
          {capabilities.map((c) => (
            <div key={c.id} className="flex items-center justify-between">
              <span className="text-sm text-ink">
                {c.name}
                {c.isCurrentBottleneck && <span className="ml-2 text-xs text-brass-strong">· current bottleneck</span>}
              </span>
              <StateBadge {...trendDisplay(c.trend)} />
            </div>
          ))}
          {capabilities.length === 0 && <p className="text-sm text-ink-muted">Capability areas will appear once your plan is generated.</p>}
        </div>
      </Panel>

      {inProgress.length > 0 && (
        <Panel>
          <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">In progress</p>
          <div className="mt-2">
            {inProgress.map((a) => (
              <ActionRow key={a.id} action={a} showStatus />
            ))}
          </div>
        </Panel>
      )}

      <Panel>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">Queued actions</p>
        <div className="mt-2">
          {candidates.length === 0 ? (
            <p className="text-sm text-ink-muted">Nothing queued right now.</p>
          ) : (
            candidates.map((a) => <ActionRow key={a.id} action={a} />)
          )}
        </div>
      </Panel>

      {recentlyCompleted.length > 0 && (
        <Panel>
          <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">Recently completed</p>
          <div className="mt-2">
            {recentlyCompleted.map((a) => (
              <ActionRow key={a.id} action={a} showStatus />
            ))}
          </div>
        </Panel>
      )}

      {adjustments.length > 0 && (
        <Panel>
          <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">Why the plan changed</p>
          <ul className="mt-2 space-y-2">
            {adjustments.map((a, i) => (
              <li key={i} className="text-sm text-ink-muted">
                <span className="tnum text-xs text-ink-faint">{new Date(a.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>{" "}
                — {a.description}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
