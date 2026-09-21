"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/apiClient";
import { formatMinutes, planHealthDisplay } from "@/lib/presentation";
import type { ActionItem, CareerGoal, CapabilityArea, Opportunity, MomentumLabel, PlanHealthState } from "@/lib/types";
import PrimaryActionCard from "@/components/PrimaryActionCard";
import ActionRow from "@/components/ActionRow";
import Panel from "@/components/Panel";
import EmptyState from "@/components/EmptyState";
import GoalOnboarding from "@/components/GoalOnboarding";
import TimeAvailablePrompt from "@/components/TimeAvailablePrompt";
import MomentumCard from "@/components/MomentumCard";
import StateBadge from "@/components/StateBadge";
import { useUser } from "@/lib/userContext";

interface TodayResponse {
  hasGoal: boolean;
  goal?: CareerGoal;
  bottleneck?: CapabilityArea | null;
  primary?: ActionItem | null;
  supporting?: ActionItem[];
  momentum?: { label: MomentumLabel; facts: string[] };
  timeBudget?: { availableMinutes: number | null; allocatedMinutes: number; remainingMinutes: number | null };
  opportunities?: Opportunity[];
  health?: { state: PlanHealthState; reasons: string[] };
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function TodayPage() {
  const { user } = useUser();
  const [data, setData] = useState<TodayResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await apiGet<TodayResponse>("/api/career/execution/today");
      setData(res);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <p className="py-16 text-center text-sm text-ink-muted">Loading your plan…</p>;
  }

  if (!data?.hasGoal) {
    return (
      <div className="py-10">
        <GoalOnboarding onCreated={load} />
      </div>
    );
  }

  const { goal, bottleneck, primary, supporting = [], momentum, timeBudget, opportunities = [], health } = data;

  return (
    <div className="space-y-6">
      <div>
        <p className="font-display text-2xl font-semibold text-ink sm:text-3xl">
          {greeting()}{user ? `, ${user.name.split(" ")[0]}` : ""}
        </p>
        <p className="mt-1 text-sm text-ink-muted">
          Working toward <span className="font-medium text-ink">{goal?.targetRole}</span>
          {bottleneck && (
            <>
              {" "}
              · current focus: <span className="font-medium text-ink">{bottleneck.name}</span>
            </>
          )}
        </p>
      </div>

      {primary ? (
        <PrimaryActionCard action={primary} onChanged={load} />
      ) : (
        <EmptyState
          title="No career actions yet"
          description="As ACEAPT learns your goals and opportunities, your first high-impact action will appear here."
        />
      )}

      {supporting.length > 0 && (
        <Panel>
          <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">Supporting actions</p>
          <div className="mt-2">
            {supporting.map((a) => (
              <ActionRow key={a.id} action={a} />
            ))}
          </div>
        </Panel>
      )}

      <TimeAvailablePrompt />

      <div className="grid gap-6 sm:grid-cols-2">
        <Panel>
          {momentum && <MomentumCard label={momentum.label} facts={momentum.facts} />}
        </Panel>

        <Panel>
          <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">This week&apos;s time</p>
          {timeBudget?.availableMinutes == null ? (
            <div className="mt-2">
              <Link href="/time-budget" className="text-sm text-brass-strong underline underline-offset-2">
                Set your available time for the week
              </Link>
            </div>
          ) : (
            <div className="mt-2">
              <p className="tnum text-lg text-ink">
                {formatMinutes(Math.max(0, timeBudget.remainingMinutes ?? 0))} <span className="text-sm text-ink-muted">remaining</span>
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                {formatMinutes(timeBudget.allocatedMinutes)} allocated of {formatMinutes(timeBudget.availableMinutes)} available
              </p>
              <Link href="/time-budget" className="mt-2 inline-block text-xs text-brass-strong underline underline-offset-2">
                View time budget
              </Link>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Panel>
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">Upcoming opportunities</p>
            <Link href="/opportunities" className="text-xs text-brass-strong underline underline-offset-2">
              View all
            </Link>
          </div>
          {opportunities.length === 0 ? (
            <p className="mt-2 text-sm text-ink-muted">No upcoming opportunities yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {opportunities.map((o) => (
                <li key={o.id} className="text-sm text-ink">
                  {o.title}
                  {o.eventDate && <span className="tnum text-ink-muted"> — {new Date(o.eventDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">Plan health</p>
            <Link href="/health" className="text-xs text-brass-strong underline underline-offset-2">
              Details
            </Link>
          </div>
          {health && (
            <div className="mt-2">
              <StateBadge {...planHealthDisplay(health.state)} />
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
