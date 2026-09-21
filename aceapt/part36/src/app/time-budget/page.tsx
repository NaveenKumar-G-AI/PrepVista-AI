"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/apiClient";
import { formatMinutes } from "@/lib/presentation";
import Panel from "@/components/Panel";
import EmptyState from "@/components/EmptyState";

interface TimeBudgetResponse {
  hasGoal: boolean;
  budget?: {
    availableMinutes: number | null;
    allocatedMinutes: number;
    remainingMinutes: number | null;
    categories: { name: string; minutes: number }[];
  };
}

export default function TimeBudgetPage() {
  const [data, setData] = useState<TimeBudgetResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [hours, setHours] = useState("6");
  const [savingMinutes, setSavingMinutes] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await apiGet<TimeBudgetResponse>("/api/career/execution/time-budget"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSetHours(e: React.FormEvent) {
    e.preventDefault();
    const availableMinutes = Math.round(Number(hours) * 60);
    if (!Number.isFinite(availableMinutes) || availableMinutes < 0) return;
    setSavingMinutes(true);
    try {
      await apiPost("/api/career/execution/time-budget", { availableMinutes });
      await load();
    } finally {
      setSavingMinutes(false);
    }
  }

  if (loading) return <p className="py-16 text-center text-sm text-ink-muted">Loading…</p>;
  if (!data?.hasGoal) return <EmptyState title="No plan yet" description="Set a career goal on the Today screen first." />;

  const budget = data.budget!;
  const pct = budget.availableMinutes && budget.availableMinutes > 0 ? Math.min(100, Math.round((budget.allocatedMinutes / budget.availableMinutes) * 100)) : 0;
  const over = budget.remainingMinutes != null && budget.remainingMinutes < 0;

  return (
    <div className="space-y-6">
      <div>
        <p className="font-display text-2xl font-semibold text-ink">Career Time Budget</p>
        <p className="mt-1 text-sm text-ink-muted">This week&apos;s available time against what your plan currently asks of you.</p>
      </div>

      <Panel>
        <form onSubmit={handleSetHours} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-medium uppercase tracking-wider text-ink-faint">Available this week (hours)</label>
            <input
              type="number"
              min={0}
              step={0.5}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="tnum mt-1 w-28 border border-hairline bg-surface px-3 py-2 text-sm text-ink"
            />
          </div>
          <button type="submit" disabled={savingMinutes} className="border border-hairline px-4 py-2 text-sm text-ink hover:border-hairline-strong disabled:opacity-50">
            {savingMinutes ? "Saving…" : "Update"}
          </button>
        </form>

        {budget.availableMinutes == null ? (
          <p className="mt-4 text-sm text-ink-muted">Set how much time you have this week to see your budget.</p>
        ) : (
          <div className="mt-5">
            <div className="flex items-baseline justify-between">
              <span className="tnum text-2xl text-ink">{formatMinutes(budget.allocatedMinutes)}</span>
              <span className="text-sm text-ink-muted">allocated of {formatMinutes(budget.availableMinutes)}</span>
            </div>
            <div className="mt-2 h-2 w-full bg-surface-recessed">
              <div className={`h-2 ${over ? "bg-rust" : "bg-brass"}`} style={{ width: `${pct}%` }} />
            </div>
            <p className={`mt-2 text-sm ${over ? "text-rust" : "text-ink-muted"}`}>
              {over
                ? `${formatMinutes(Math.abs(budget.remainingMinutes ?? 0))} over what's available this week`
                : `${formatMinutes(budget.remainingMinutes ?? 0)} remaining`}
            </p>
          </div>
        )}
      </Panel>

      {budget.categories.length > 0 && (
        <Panel>
          <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">Allocation by area</p>
          <div className="mt-3 space-y-2.5">
            {budget.categories.map((c) => (
              <div key={c.name} className="flex items-center justify-between text-sm">
                <span className="text-ink">{c.name}</span>
                <span className="tnum text-ink-muted">{formatMinutes(c.minutes)}</span>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
