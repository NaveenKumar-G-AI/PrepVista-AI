"use client";

import { useState } from "react";
import Link from "next/link";
import { apiPost } from "@/lib/apiClient";
import { formatMinutes, actionTypeDisplay } from "@/lib/presentation";
import Panel from "./Panel";
import EmptyState from "./EmptyState";
import type { ActionItem } from "@/lib/types";

interface TimePlanItem {
  action: ActionItem;
  offsetMin: number;
  sessionMinutes: number;
  condensed: boolean;
}
interface TimePlanResult {
  mode: "sequence" | "condensed" | "none";
  items: TimePlanItem[];
  totalMinutes: number;
}

const PRESETS = [20, 45, 60, 120];

function offsetLabel(offsetMin: number, sessionMinutes: number): string {
  const end = offsetMin + sessionMinutes;
  return `${offsetMin.toString().padStart(2, "0")}–${end.toString().padStart(2, "0")}`;
}

export default function TimeAvailablePrompt() {
  const [minutes, setMinutes] = useState(30);
  const [plan, setPlan] = useState<TimePlanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [queried, setQueried] = useState<number | null>(null);

  async function handleSubmit(m: number) {
    if (!Number.isFinite(m) || m < 5) return;
    setLoading(true);
    setQueried(m);
    try {
      const res = await apiPost<{ plan: TimePlanResult }>("/api/career/execution/time-available", { minutes: m });
      setPlan(res.plan);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Panel>
      <p className="text-xs font-medium uppercase tracking-wider text-ink-faint">How much time do you have?</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {PRESETS.map((m) => (
          <button
            key={m}
            onClick={() => {
              setMinutes(m);
              handleSubmit(m);
            }}
            className={`border px-3 py-1.5 text-sm ${
              queried === m ? "border-brass bg-brass-soft text-brass-strong" : "border-hairline text-ink hover:border-hairline-strong"
            }`}
          >
            {formatMinutes(m)}
          </button>
        ))}
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={5}
            max={480}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
            className="tnum w-20 border border-hairline bg-surface px-2 py-1.5 text-sm"
            aria-label="Minutes available"
          />
          <button onClick={() => handleSubmit(minutes)} className="border border-hairline px-3 py-1.5 text-sm text-ink hover:border-hairline-strong">
            Go
          </button>
        </div>
      </div>

      {loading && <p className="mt-4 text-sm text-ink-muted">Finding the highest-impact plan for that time…</p>}

      {!loading && plan && plan.items.length === 0 && (
        <div className="mt-4">
          <EmptyState title="Nothing fits right now" description="No open action fits that window yet — try a different amount of time." />
        </div>
      )}

      {!loading && plan && plan.items.length > 0 && (
        <div className="mt-4">
          {plan.items[0].condensed && (
            <p className="mb-2 text-xs text-ink-muted">Shortened to fit the time you have.</p>
          )}
          {plan.items.map((item) => (
            <div key={item.action.id} className="flex items-center justify-between gap-3 border-b border-hairline py-2.5 last:border-b-0">
              <div className="flex min-w-0 items-center gap-3">
                <span className="tnum flex-none text-xs text-ink-faint">{offsetLabel(item.offsetMin, item.sessionMinutes)}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{item.action.title}</p>
                  <p className="text-xs text-ink-muted">{actionTypeDisplay(item.action.actionType).label}</p>
                </div>
              </div>
              <Link
                href={`/session/${item.action.id}?minutes=${item.sessionMinutes}`}
                className="flex-none text-xs font-medium text-brass-strong underline underline-offset-2"
              >
                Start
              </Link>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
