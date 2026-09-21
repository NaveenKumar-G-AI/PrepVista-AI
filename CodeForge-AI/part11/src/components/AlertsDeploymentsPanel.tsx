"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { AlertRecord, DeploymentRecord } from "@/lib/engine/types";
import { Panel, EmptyState } from "@/components/ui";

export function AlertsDeploymentsPanel({ incidentId, onInspectDeployment }: { incidentId: string; onInspectDeployment: () => void }) {
  const [alerts, setAlerts] = useState<AlertRecord[] | null>(null);
  const [deployments, setDeployments] = useState<DeploymentRecord[] | null>(null);
  const [openedDeploys, setOpenedDeploys] = useState(false);

  useEffect(() => {
    api.listAlerts(incidentId).then((r) => setAlerts(r.alerts));
    api.listDeployments(incidentId).then((r) => setDeployments(r.deployments));
  }, [incidentId]);

  function markDeploymentsInspected() {
    if (openedDeploys) return;
    setOpenedDeploys(true);
    api.executeAction(incidentId, { actionType: "INSPECT_DEPLOYMENT", idempotencyKey: "inspect-deployment-panel-open" }).catch(() => undefined);
    onInspectDeployment();
  }

  return (
    <div className="space-y-4">
      <Panel title="Alerts">
        {!alerts ? (
          <EmptyState>Loading…</EmptyState>
        ) : alerts.length === 0 ? (
          <EmptyState>No alerts yet.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a) => (
              <li key={a.id} className="rounded-md border border-sev-high/25 bg-sev-high/5 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="font-data text-xs font-semibold text-sev-high">{a.alertType}</span>
                  <span className="font-data text-[11px] text-console-textFaint">t = {a.offsetMinutes}m</span>
                </div>
                <p className="mt-1 text-xs text-console-textMuted">{a.message}</p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Deployment history">
        {!deployments ? (
          <EmptyState>Loading…</EmptyState>
        ) : (
          <ul onClick={markDeploymentsInspected} className="space-y-2">
            {deployments.map((d) => (
              <li key={d.id} className="rounded-md border border-console-borderMuted px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="font-data text-xs font-semibold">{d.serviceKey}</span>
                  <span className="font-data text-[11px] text-console-textFaint">{d.version}</span>
                </div>
                <p className="mt-1 text-xs text-console-textMuted">{d.changeSummary}</p>
                <p className="mt-1 font-data text-[11px] text-console-textFaint">
                  t = {d.offsetMinutes}m · {d.commitRef}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
