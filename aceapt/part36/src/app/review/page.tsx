"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/apiClient";
import Panel from "@/components/Panel";
import EmptyState from "@/components/EmptyState";
import StateBadge from "@/components/StateBadge";
import MomentumCard from "@/components/MomentumCard";
import { trendDisplay, planHealthDisplay } from "@/lib/presentation";
import type { CapabilityTrend, MomentumLabel, PlanHealthState } from "@/lib/types";

interface ReviewResponse {
  hasGoal: boolean;
  review?: {
    weekStart: string;
    recommended: number;
    completed: number;
    measured: number;
    deferred: number;
    blocked: number;
    capabilityChanges: { name: string; trend: CapabilityTrend; isBottleneck: boolean }[];
    currentBottleneck: string | null;
    upcomingDeadlineDays: number | null;
    planHealth: { state: PlanHealthState; reasons: string[] };
    narrative: string;
  };
  momentum?: { label: MomentumLabel; facts: string[] };
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="tnum text-2xl text-ink">{value}</p>
      <p className="text-xs text-ink-muted">{label}</p>
    </div>
  );
}

export default function ReviewPage() {
  const [data, setData] = useState<ReviewResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<ReviewResponse>("/api/career/execution/review")
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="py-16 text-center text-sm text-ink-muted">Loading your week…</p>;
  if (!data?.hasGoal) return <EmptyState title="No plan yet" description="Set a career goal on the Today screen first." />;

  const { review, momentum } = data;
  if (!review) return null;

  return (
    <div className="space-y-6">
      <div>
        <p className="font-display text-2xl font-semibold text-ink">Your week</p>
        <p className="mt-1 text-sm text-ink-muted">Week of {new Date(review.weekStart).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>
      </div>

      <Panel>
        <p className="text-sm leading-relaxed text-ink">{review.narrative}</p>
      </Panel>

      <Panel>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">What worked / what didn&apos;t</p>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Stat label="Recommended" value={review.recommended} />
          <Stat label="Completed" value={review.completed} />
          <Stat label="Measured" value={review.measured} />
          <Stat label="Deferred" value={review.deferred} />
          <Stat label="Blocked" value={review.blocked} />
        </div>
      </Panel>

      <Panel>
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">What changed</p>
          <Link href="/changed" className="text-xs text-brass-strong underline underline-offset-2">
            Full detail
          </Link>
        </div>
        <div className="mt-3 space-y-2.5">
          {review.capabilityChanges.map((c) => (
            <div key={c.name} className="flex items-center justify-between">
              <span className="text-sm text-ink">{c.name}</span>
              <StateBadge {...trendDisplay(c.trend)} />
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid gap-6 sm:grid-cols-2">
        <Panel>{momentum && <MomentumCard label={momentum.label} facts={momentum.facts} />}</Panel>
        <Panel>
          <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">Plan health</p>
          <div className="mt-2">
            <StateBadge {...planHealthDisplay(review.planHealth.state)} />
          </div>
        </Panel>
      </div>

      <Panel>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">What should happen next</p>
        <p className="mt-2 text-sm text-ink-muted">
          {review.currentBottleneck ? `Keep building evidence on ${review.currentBottleneck}.` : "Complete your baseline action to establish a clear focus area."}
        </p>
        <Link href="/today" className="mt-3 inline-block text-sm font-medium text-brass-strong underline underline-offset-2">
          Go to today&apos;s next move
        </Link>
      </Panel>
    </div>
  );
}
