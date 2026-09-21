"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AuthGate } from "@/components/AuthGate";
import { api } from "@/lib/client/api";
import { IncidentInstance, IncidentTemplatePublic, ServiceHealth } from "@/lib/engine/types";
import { IncidentHeader } from "@/components/IncidentHeader";
import { ServiceGraph } from "@/components/ServiceGraph";
import { MetricsPanel } from "@/components/MetricsPanel";
import { LogsPanel } from "@/components/LogsPanel";
import { TracesPanel } from "@/components/TracesPanel";
import { AlertsDeploymentsPanel } from "@/components/AlertsDeploymentsPanel";
import { HypothesisWorkspace } from "@/components/HypothesisWorkspace";
import { ActionPanel } from "@/components/ActionPanel";
import { CommunicationPanel } from "@/components/CommunicationPanel";
import { TimelinePanel } from "@/components/TimelinePanel";

const TABS = ["Overview", "Metrics", "Logs", "Traces", "Alerts & Deploys", "Hypotheses", "Actions", "Communication", "Timeline"] as const;
type Tab = (typeof TABS)[number];

function WorkspaceInner({ incidentId }: { incidentId: string }) {
  const router = useRouter();
  const [incident, setIncident] = useState<IncidentInstance | null>(null);
  const [template, setTemplate] = useState<IncidentTemplatePublic | null>(null);
  const [tab, setTab] = useState<Tab>("Overview");
  const [citedEvidence, setCitedEvidence] = useState<string[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [health, setHealth] = useState<Record<string, ServiceHealth>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      let r = await api.getIncident(incidentId);
      if (r.incident.state === "CREATED") {
        const started = await api.startIncident(incidentId);
        r = { ...r, incident: started.incident };
      }
      setIncident(r.incident);
      setTemplate(r.template);
      const metrics = await api.getMetrics(incidentId);
      const nextHealth: Record<string, ServiceHealth> = {};
      for (const s of r.template.services) {
        const errKey = Object.keys(metrics.series).find((k) => k.startsWith(`${s.key}:`) && k.includes("error_rate"));
        const series = errKey ? metrics.series[errKey] : undefined;
        const latest = series?.[series.length - 1]?.value;
        nextHealth[s.key] = latest === undefined ? "UNKNOWN" : latest > 15 ? "FAILING" : latest > 2 ? "DEGRADED" : "HEALTHY";
      }
      setHealth(nextHealth);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [incidentId]);

  useEffect(() => {
    load();
  }, [load]);

  function bumpTimeline() {
    setRefreshKey((k) => k + 1);
    load();
  }

  function citeEvidence(id: string) {
    setCitedEvidence((prev) => (prev.includes(id) ? prev : [...prev, id]));
    bumpTimeline();
  }

  if (error) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <p className="text-sm text-sev-critical">{error}</p>
        <Link href="/" className="mt-4 inline-block text-sm text-accent-glow hover:underline">
          ← Back to dashboard
        </Link>
      </main>
    );
  }

  if (!incident || !template) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-console-textMuted">Loading incident…</div>;
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/" className="font-data text-xs text-console-textFaint hover:text-console-textMuted">
          ← Dashboard
        </Link>
        {["RESOLVED", "POSTMORTEM", "EVALUATED"].includes(incident.state) && (
          <Link
            href={incident.state === "EVALUATED" ? `/incidents/${incidentId}/evaluation` : `/incidents/${incidentId}/postmortem`}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-glow"
          >
            {incident.state === "EVALUATED" ? "View evaluation →" : "Continue to postmortem →"}
          </Link>
        )}
      </div>

      <IncidentHeader incident={incident} template={template} />

      <div className="mt-5 flex gap-1 overflow-x-auto border-b border-console-borderMuted pb-px">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-2 font-data text-xs transition-colors ${
              tab === t ? "border-accent text-accent-glow" : "border-transparent text-console-textFaint hover:text-console-textMuted"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-5">
          {tab === "Overview" && (
            <div className="rounded-lg border border-console-border bg-console-surface p-4 shadow-panel">
              <h2 className="mb-2 font-data text-xs font-semibold uppercase tracking-wider text-console-textMuted">System architecture</h2>
              <ServiceGraph services={template.services} health={health} />
            </div>
          )}
          {tab === "Metrics" && <MetricsPanel incidentId={incidentId} onInspect={bumpTimeline} />}
          {tab === "Logs" && <LogsPanel incidentId={incidentId} services={template.services.map((s) => s.key)} onCiteEvidence={citeEvidence} />}
          {tab === "Traces" && <TracesPanel incidentId={incidentId} onInspect={citeEvidence} />}
          {tab === "Alerts & Deploys" && <AlertsDeploymentsPanel incidentId={incidentId} onInspectDeployment={bumpTimeline} />}
          {tab === "Hypotheses" && (
            <HypothesisWorkspace incidentId={incidentId} candidateCauses={template.candidateCauseKeys} citedEvidence={citedEvidence} />
          )}
          {tab === "Actions" && <ActionPanel incidentId={incidentId} actionDefs={template.actionDefs} onIncidentUpdate={(i) => { setIncident(i); bumpTimeline(); }} />}
          {tab === "Communication" && <CommunicationPanel incidentId={incidentId} />}
          {tab === "Timeline" && <TimelinePanel incidentId={incidentId} refreshKey={refreshKey} />}
        </div>

        <div className="space-y-5">
          <TimelinePanel incidentId={incidentId} refreshKey={refreshKey} />
        </div>
      </div>
    </main>
  );
}

export default function WorkspacePage({ params }: { params: { incidentId: string } }) {
  return (
    <AuthGate>
      <WorkspaceInner incidentId={params.incidentId} />
    </AuthGate>
  );
}
