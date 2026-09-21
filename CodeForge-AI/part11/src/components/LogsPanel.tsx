"use client";

import { useEffect, useState } from "react";
import { api, newIdempotencyKey } from "@/lib/client/api";
import { Panel, EmptyState } from "@/components/ui";

interface LogLineView {
  id: string;
  offsetSeconds: number;
  serviceKey: string;
  level: string;
  endpoint?: string;
  statusCode?: number;
  durationMs?: number;
  message: string;
  errorCode?: string;
  metadata: Record<string, unknown>;
}

const LEVEL_COLOR: Record<string, string> = {
  ERROR: "text-sev-critical",
  WARN: "text-sev-medium",
  INFO: "text-console-textMuted",
  DEBUG: "text-console-textFaint",
};

export function LogsPanel({
  incidentId,
  services,
  onCiteEvidence,
}: {
  incidentId: string;
  services: string[];
  onCiteEvidence: (id: string) => void;
}) {
  const [lines, setLines] = useState<LogLineView[] | null>(null);
  const [q, setQ] = useState("");
  const [service, setService] = useState("");
  const [level, setLevel] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [citing, setCiting] = useState<string | null>(null);
  const openedRef = useState(() => ({ done: false }))[0];

  async function search() {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (service) params.set("service", service);
    if (level) params.set("level", level);
    params.set("pageSize", "100");
    const r = await api.searchLogs(incidentId, params);
    setLines(r.lines as LogLineView[]);
    if (!openedRef.done) {
      openedRef.done = true;
      api.executeAction(incidentId, { actionType: "INSPECT_LOGS", idempotencyKey: "inspect-logs-panel-open" }).catch(() => undefined);
    }
  }

  useEffect(() => {
    search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidentId]);

  async function cite(lineId: string) {
    setCiting(lineId);
    try {
      await api.executeAction(incidentId, {
        actionType: "INSPECT_LOGS",
        idempotencyKey: `inspect-logs-cite-${lineId}`,
        evidenceKey: lineId,
      });
      onCiteEvidence(lineId);
    } finally {
      setCiting(null);
    }
  }

  return (
    <Panel title="Logs">
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          placeholder="Search message / metadata…"
          className="min-w-[200px] flex-1 rounded-md border border-console-border bg-console-raised px-2.5 py-1.5 font-data text-xs outline-none focus:border-accent"
        />
        <select
          value={service}
          onChange={(e) => setService(e.target.value)}
          className="rounded-md border border-console-border bg-console-raised px-2 py-1.5 font-data text-xs"
        >
          <option value="">All services</option>
          {services.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          className="rounded-md border border-console-border bg-console-raised px-2 py-1.5 font-data text-xs"
        >
          <option value="">All levels</option>
          {["DEBUG", "INFO", "WARN", "ERROR"].map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <button onClick={search} className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-glow">
          Search
        </button>
      </div>

      {!lines ? (
        <EmptyState>Loading…</EmptyState>
      ) : lines.length === 0 ? (
        <EmptyState>No log lines match.</EmptyState>
      ) : (
        <div className="max-h-96 overflow-y-auto rounded-md border border-console-borderMuted">
          {lines.map((l) => (
            <div key={l.id} className="border-b border-console-borderMuted last:border-b-0">
              <button onClick={() => setExpanded(expanded === l.id ? null : l.id)} className="flex w-full items-start gap-3 px-3 py-2 text-left hover:bg-console-raised">
                <span className="font-data text-[11px] text-console-textFaint shrink-0 pt-0.5">{(l.offsetSeconds / 60).toFixed(1)}m</span>
                <span className={`font-data text-[11px] font-semibold shrink-0 pt-0.5 w-12 ${LEVEL_COLOR[l.level]}`}>{l.level}</span>
                <span className="font-data text-[11px] text-console-textFaint shrink-0 pt-0.5 w-28 truncate">{l.serviceKey}</span>
                <span className="text-xs text-console-text">{l.message}</span>
              </button>
              {expanded === l.id && (
                <div className="border-t border-console-borderMuted bg-console-raised/50 px-3 py-2.5">
                  <pre className="whitespace-pre-wrap font-data text-[11px] text-console-textMuted">
                    {JSON.stringify(
                      { requestId: l.id, endpoint: l.endpoint, statusCode: l.statusCode, durationMs: l.durationMs, errorCode: l.errorCode, ...l.metadata },
                      null,
                      2
                    )}
                  </pre>
                  <button
                    onClick={() => cite(l.id)}
                    disabled={citing === l.id}
                    className="mt-2 rounded border border-accent/40 bg-accent/10 px-2 py-1 font-data text-[11px] text-accent-glow hover:bg-accent/20 disabled:opacity-50"
                  >
                    {citing === l.id ? "Citing…" : "Cite as evidence"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
