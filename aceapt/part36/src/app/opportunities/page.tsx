"use client";

import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "@/lib/apiClient";
import Panel from "@/components/Panel";
import EmptyState from "@/components/EmptyState";
import type { Opportunity, OpportunityType } from "@/lib/types";

interface OpportunitiesResponse {
  opportunities: Opportunity[];
}

const TYPES: OpportunityType[] = ["INTERVIEW", "APPLICATION_DEADLINE", "ASSESSMENT", "PLACEMENT_DRIVE"];
const TYPE_LABEL: Record<OpportunityType, string> = {
  INTERVIEW: "Interview",
  APPLICATION_DEADLINE: "Application deadline",
  ASSESSMENT: "Assessment",
  PLACEMENT_DRIVE: "Placement drive",
};

function daysAway(dateIso: string): number {
  return Math.ceil((new Date(dateIso).getTime() - Date.now()) / 86_400_000);
}

export default function OpportunitiesPage() {
  const [data, setData] = useState<OpportunitiesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [organization, setOrganization] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [opportunityType, setOpportunityType] = useState<OpportunityType>("INTERVIEW");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await apiGet<OpportunitiesResponse>("/api/career/opportunities"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await apiPost("/api/career/opportunities", { title, organization, eventDate: eventDate || null, opportunityType });
      setTitle("");
      setOrganization("");
      setEventDate("");
      setShowForm(false);
      await load();
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="py-16 text-center text-sm text-ink-muted">Loading…</p>;

  const opportunities = data?.opportunities ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-display text-2xl font-semibold text-ink">Opportunities</p>
          <p className="mt-1 text-sm text-ink-muted">Upcoming interviews, deadlines, and drives your plan prepares you for.</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="border border-hairline px-3 py-2 text-sm text-ink hover:border-hairline-strong">
          {showForm ? "Cancel" : "Add"}
        </button>
      </div>

      {showForm && (
        <Panel>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-ink-faint">Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} required className="mt-1 w-full border border-hairline bg-surface px-3 py-2 text-sm text-ink" placeholder="e.g. Backend Engineer Intern — TechCorp" />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-ink-faint">Organization</label>
                <input value={organization} onChange={(e) => setOrganization(e.target.value)} className="mt-1 w-full border border-hairline bg-surface px-3 py-2 text-sm text-ink" />
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-ink-faint">Date</label>
                <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="tnum mt-1 w-full border border-hairline bg-surface px-3 py-2 text-sm text-ink" />
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wider text-ink-faint">Type</label>
                <select value={opportunityType} onChange={(e) => setOpportunityType(e.target.value as OpportunityType)} className="mt-1 w-full border border-hairline bg-surface px-3 py-2 text-sm text-ink">
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button type="submit" disabled={busy} className="bg-brass px-5 py-2.5 text-sm font-medium text-white hover:bg-brass-strong disabled:opacity-50">
              {busy ? "Saving…" : "Add opportunity"}
            </button>
          </form>
        </Panel>
      )}

      {opportunities.length === 0 ? (
        <EmptyState title="No upcoming opportunities" description="Add an interview, deadline, or placement drive so ACEAPT can prioritize preparation for it." />
      ) : (
        <div className="space-y-3">
          {opportunities.map((o) => {
            const days = o.eventDate ? daysAway(o.eventDate) : null;
            return (
              <Panel key={o.id}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-ink">{o.title}</p>
                    {o.organization && <p className="text-xs text-ink-muted">{o.organization}</p>}
                    <p className="mt-1 text-xs text-ink-faint">{TYPE_LABEL[o.opportunityType]}</p>
                  </div>
                  {days != null && (
                    <div className="flex-none text-right">
                      <p className="tnum text-lg text-ink">{days >= 0 ? `T-${days}` : "Past"}</p>
                      <p className="text-xs text-ink-muted">{new Date(o.eventDate!).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</p>
                    </div>
                  )}
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
