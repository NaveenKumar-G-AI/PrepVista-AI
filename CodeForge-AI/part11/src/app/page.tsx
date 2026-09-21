"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthGate } from "@/components/AuthGate";
import { api } from "@/lib/client/api";
import { IncidentInstance } from "@/lib/engine/types";
import { SeverityBadge, StateBadge } from "@/components/ui";

function DashboardInner() {
  const router = useRouter();
  const [incidents, setIncidents] = useState<IncidentInstance[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listIncidents()
      .then((r) => setIncidents(r.incidents))
      .catch((e) => setError(e.message));
  }, []);

  async function startNew() {
    setCreating(true);
    setError(null);
    try {
      const { incident } = await api.createIncident("pf-2048");
      router.push(`/incidents/${incident.id}`);
    } catch (e) {
      setError((e as Error).message);
      setCreating(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <p className="font-data text-xs uppercase tracking-widest text-console-textFaint">CodeForge · Incident Response</p>
      <h1 className="mt-2 text-2xl font-semibold">Production incidents</h1>
      <p className="mt-1 text-sm text-console-textMuted">
        Investigate a realistic production incident like a real engineer — observe, form hypotheses, mitigate, fix, and write the
        postmortem.
      </p>

      {error && <p className="mt-4 rounded-md border border-sev-critical/30 bg-sev-critical/10 px-3 py-2 text-sm text-sev-critical">{error}</p>}

      <div className="mt-8 rounded-lg border border-console-border bg-console-surface p-5 shadow-panel">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <SeverityBadge severity="SEV-2" />
              <span className="font-data text-xs text-console-textFaint">DATABASE_PERFORMANCE · INTERMEDIATE</span>
            </div>
            <h3 className="mt-2 font-semibold">Placement applications experiencing failures</h3>
            <p className="mt-1 text-sm text-console-textMuted">
              18% of application-submission requests are failing. Requests are timing out under production load.
            </p>
          </div>
          <button
            onClick={startNew}
            disabled={creating}
            className="shrink-0 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-glow disabled:opacity-50"
          >
            {creating ? "Starting…" : "Start incident"}
          </button>
        </div>
      </div>

      <h2 className="mt-10 font-data text-xs font-semibold uppercase tracking-wider text-console-textMuted">Your attempts</h2>
      <div className="mt-3 divide-y divide-console-borderMuted rounded-lg border border-console-border bg-console-surface">
        {incidents === null && <p className="p-4 text-sm text-console-textFaint">Loading…</p>}
        {incidents?.length === 0 && <p className="p-4 text-sm text-console-textFaint">No incidents yet — start one above.</p>}
        {incidents?.map((inc) => (
          <button
            key={inc.id}
            onClick={() => router.push(`/incidents/${inc.id}`)}
            className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-console-raised"
          >
            <div>
              <span className="font-data text-sm">{inc.code}</span>
              <span className="ml-3 text-xs text-console-textFaint">{new Date(inc.createdAt).toLocaleString()}</span>
            </div>
            <StateBadge state={inc.state} />
          </button>
        ))}
      </div>
    </main>
  );
}

export default function DashboardPage() {
  return (
    <AuthGate>
      <DashboardInner />
    </AuthGate>
  );
}
