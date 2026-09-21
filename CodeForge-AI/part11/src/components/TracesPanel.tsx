"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { Panel, EmptyState } from "@/components/ui";

interface TraceSummary {
  traceKey: string;
  label: string;
  offsetSeconds: number;
  totalDurationMs: number;
  status: string;
  spanCount: number;
}
interface TraceSpan {
  spanKey: string;
  parentSpanKey?: string;
  serviceKey: string;
  operation: string;
  startOffsetMs: number;
  durationMs: number;
  status: string;
}
interface TraceDetail extends TraceSummary {
  spans: TraceSpan[];
}

export function TracesPanel({ incidentId, onInspect }: { incidentId: string; onInspect: (traceKey: string) => void }) {
  const [traces, setTraces] = useState<TraceSummary[] | null>(null);
  const [selected, setSelected] = useState<TraceDetail | null>(null);

  useEffect(() => {
    api.listTraces(incidentId).then((r) => setTraces(r.traces));
  }, [incidentId]);

  async function select(traceKey: string) {
    const r = await api.getTrace(incidentId, traceKey);
    setSelected(r.trace as TraceDetail);
    api
      .executeAction(incidentId, { actionType: "INSPECT_TRACES", idempotencyKey: `inspect-trace-${traceKey}`, evidenceKey: traceKey })
      .catch(() => undefined);
    onInspect(traceKey);
  }

  const maxDuration = selected ? Math.max(...selected.spans.map((s) => s.startOffsetMs + s.durationMs)) : 1;

  return (
    <Panel title="Traces">
      {!traces ? (
        <EmptyState>Loading…</EmptyState>
      ) : traces.length === 0 ? (
        <EmptyState>No traces available yet.</EmptyState>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {traces.map((t) => (
              <button
                key={t.traceKey}
                onClick={() => select(t.traceKey)}
                className={`rounded border px-2.5 py-1.5 text-left font-data text-[11px] transition-colors ${
                  selected?.traceKey === t.traceKey
                    ? "border-accent/40 bg-accent/15 text-accent-glow"
                    : t.status === "ERROR"
                      ? "border-sev-critical/30 bg-sev-critical/5 text-sev-critical"
                      : "border-console-border bg-console-raised text-console-textMuted"
                }`}
              >
                {t.label} · {t.totalDurationMs}ms
              </button>
            ))}
          </div>

          {selected && (
            <div className="rounded-md border border-console-borderMuted p-3">
              {selected.spans
                .slice()
                .sort((a, b) => a.startOffsetMs - b.startOffsetMs)
                .map((s) => (
                  <div key={s.spanKey} className="mb-2 last:mb-0">
                    <div className="mb-0.5 flex items-center justify-between">
                      <span className="font-data text-[11px] text-console-textMuted">
                        {s.serviceKey} · {s.operation}
                      </span>
                      <span className={`font-data text-[11px] ${s.durationMs > maxDuration * 0.5 ? "text-sev-critical" : "text-console-textFaint"}`}>
                        {s.durationMs}ms
                      </span>
                    </div>
                    <div className="h-3 w-full rounded bg-console-raised">
                      <div
                        className={`h-3 rounded ${s.status === "OK" ? "bg-accent" : "bg-sev-critical"}`}
                        style={{
                          marginLeft: `${(s.startOffsetMs / maxDuration) * 100}%`,
                          width: `${Math.max(1, (s.durationMs / maxDuration) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
