"use client";

import { useState } from "react";
import { api, newIdempotencyKey } from "@/lib/client/api";
import { ActionType, IncidentInstance } from "@/lib/engine/types";
import { Panel, RiskBadge, EmptyState } from "@/components/ui";

interface ActionDefPublic {
  actionType: ActionType;
  targetServiceKey?: string;
  risk: string;
  requiresConfirmation: boolean;
  simMinutesCost: number;
  description: string;
  expectedEffect: string;
}

export function ActionPanel({
  incidentId,
  actionDefs,
  onIncidentUpdate,
}: {
  incidentId: string;
  actionDefs: ActionDefPublic[];
  onIncidentUpdate: (incident: IncidentInstance) => void;
}) {
  const [pending, setPending] = useState<ActionDefPublic | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(def: ActionDefPublic, confirmed: boolean) {
    const key = `${def.actionType}-${def.targetServiceKey ?? "none"}`;
    setRunning(key);
    setError(null);
    try {
      const res = await api.executeAction(incidentId, {
        actionType: def.actionType,
        targetServiceKey: def.targetServiceKey,
        confirmed,
        idempotencyKey: newIdempotencyKey(),
      });
      setLastResult(res.narrative);
      onIncidentUpdate(res.incident);
      setPending(null);
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 409) {
        setPending(def); // needs confirmation
      } else {
        setError(err.message);
      }
    } finally {
      setRunning(null);
    }
  }

  return (
    <Panel title="Actions">
      {actionDefs.length === 0 ? (
        <EmptyState>No actions available.</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {actionDefs.map((def) => {
            const key = `${def.actionType}-${def.targetServiceKey ?? "none"}`;
            return (
              <button
                key={key}
                onClick={() => run(def, false)}
                disabled={running === key}
                className="rounded-md border border-console-border bg-console-raised p-2.5 text-left transition-colors hover:border-accent/40 disabled:opacity-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-data text-xs font-semibold">{def.actionType.replace(/_/g, " ")}</span>
                  <RiskBadge risk={def.risk} />
                </div>
                {def.targetServiceKey && <p className="mt-0.5 font-data text-[10px] text-console-textFaint">{def.targetServiceKey}</p>}
                <p className="mt-1 text-[11px] text-console-textMuted">{def.expectedEffect}</p>
              </button>
            );
          })}
        </div>
      )}

      {error && <p className="mt-3 rounded-md border border-sev-critical/30 bg-sev-critical/10 px-3 py-2 text-xs text-sev-critical">{error}</p>}
      {lastResult && !pending && (
        <p className="mt-3 rounded-md border border-console-borderMuted bg-console-raised px-3 py-2 text-xs text-console-textMuted">{lastResult}</p>
      )}

      {pending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-lg border border-sev-critical/30 bg-console-surface p-5 shadow-panel">
            <div className="flex items-center gap-2">
              <span className="font-data text-xs font-semibold text-sev-critical">DANGEROUS ACTION</span>
            </div>
            <h3 className="mt-2 font-semibold">{pending.actionType.replace(/_/g, " ")}</h3>
            <p className="mt-1 text-sm text-console-textMuted">{pending.description}</p>
            <p className="mt-2 text-xs text-console-textFaint">Expected effect: {pending.expectedEffect}</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setPending(null)} className="rounded-md border border-console-border px-3 py-1.5 text-xs text-console-textMuted hover:bg-console-raised">
                Cancel
              </button>
              <button onClick={() => run(pending, true)} className="rounded-md bg-sev-critical px-3 py-1.5 text-xs font-medium text-white hover:opacity-90">
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}
