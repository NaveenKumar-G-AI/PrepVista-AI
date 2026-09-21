import React, { useCallback, useEffect, useState } from "react";
import type { OpsClient, AuditEventDTO } from "../../api/opsClient";
import { StatusBadge } from "../../components/ops/StatusBadge";
import "../../components/ops/ops.css";

interface Props {
  client: OpsClient;
}

const PAGE_SIZE = 25;

export function AuditCenter({ client }: Props) {
  const [events, setEvents] = useState<AuditEventDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [actionFilter, setActionFilter] = useState("");
  const [resultFilter, setResultFilter] = useState("");
  const [selected, setSelected] = useState<AuditEventDTO | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await client.listAuditEvents({
        action: actionFilter || undefined,
        result: resultFilter || undefined,
        limit: PAGE_SIZE,
        offset
      });
      setEvents(res.events);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit events. You may not have audit-read access for this organization.");
    }
  }, [client, actionFilter, resultFilter, offset]);

  useEffect(() => {
    load();
  }, [load]);

  async function openDetail(id: string) {
    try {
      const res = await client.getAuditEvent(id);
      setSelected(res.event);
    } catch {
      // Detail lookup failing (e.g. RLS hid it) shouldn't crash the list view.
      setSelected(null);
    }
  }

  return (
    <div className="ops-dashboard">
      <div className="ops-header">
        <div>
          <h2 className="ops-title">Audit Center</h2>
          <p className="ops-subtitle">Who did what, to which resource, when — and what the result was.</p>
        </div>
        <button className="ops-btn" onClick={load}>
          Refresh
        </button>
      </div>

      <div className="ops-toolbar">
        <input
          className="ops-input"
          placeholder="Filter by action (e.g. security_alert.resolve)"
          value={actionFilter}
          onChange={(e) => {
            setOffset(0);
            setActionFilter(e.target.value);
          }}
          aria-label="Filter by action"
        />
        <select
          className="ops-select"
          value={resultFilter}
          onChange={(e) => {
            setOffset(0);
            setResultFilter(e.target.value);
          }}
          aria-label="Filter by result"
        >
          <option value="">All results</option>
          <option value="SUCCESS">Success</option>
          <option value="DENIED">Denied</option>
          <option value="ERROR">Error</option>
        </select>
      </div>

      {error && (
        <div className="ops-error" role="alert">
          {error}
        </div>
      )}

      {!error && (
        <div className="ops-panel">
          {events === null ? (
            <div className="ops-loading">Loading audit events…</div>
          ) : events.length === 0 ? (
            <div className="ops-empty">No audit events match these filters.</div>
          ) : (
            <>
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Actor</th>
                    <th>Action</th>
                    <th>Resource</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((evt) => (
                    <tr
                      className="ops-row"
                      key={evt.id}
                      tabIndex={0}
                      role="button"
                      aria-label={`View detail for ${evt.action}`}
                      style={{ cursor: "pointer" }}
                      onClick={() => openDetail(evt.id)}
                      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openDetail(evt.id)}
                    >
                      <td className="ops-mono">{new Date(evt.created_at).toLocaleString()}</td>
                      <td className="ops-mono">{evt.actor_user_id ?? "system"}</td>
                      <td>{evt.action}</td>
                      <td>
                        {evt.resource_type ?? "—"} {evt.resource_id ? <span className="ops-mono">#{evt.resource_id.slice(0, 8)}</span> : null}
                      </td>
                      <td>
                        <StatusBadge status={evt.result === "SUCCESS" ? "RESOLVED" : evt.result === "DENIED" ? "UNAVAILABLE" : "DEGRADED"} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="ops-pagination">
                <button className="ops-btn" onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} disabled={offset === 0}>
                  Previous
                </button>
                <button className="ops-btn" onClick={() => setOffset(offset + PAGE_SIZE)} disabled={events.length < PAGE_SIZE}>
                  Next
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {selected && (
        <div className="ops-detail-panel">
          <div className="ops-header" style={{ marginBottom: 12 }}>
            <h3 className="ops-title" style={{ fontSize: 15 }}>
              {selected.action}
            </h3>
            <button className="ops-btn" onClick={() => setSelected(null)} aria-label="Close detail panel">
              Close
            </button>
          </div>
          <dl style={{ display: "grid", gridTemplateColumns: "140px 1fr", rowGap: 8, fontSize: 13 }}>
            <dt className="ops-subtitle">Actor</dt>
            <dd className="ops-mono">
              {selected.actor_user_id ?? "system"} ({selected.actor_role ?? "n/a"})
            </dd>
            <dt className="ops-subtitle">Organization</dt>
            <dd className="ops-mono">{selected.organization_id ?? "platform-wide"}</dd>
            <dt className="ops-subtitle">Resource</dt>
            <dd>
              {selected.resource_type ?? "—"} <span className="ops-mono">{selected.resource_id}</span>
            </dd>
            <dt className="ops-subtitle">Result</dt>
            <dd>
              <StatusBadge status={selected.result === "SUCCESS" ? "RESOLVED" : selected.result === "DENIED" ? "UNAVAILABLE" : "DEGRADED"} />
            </dd>
            <dt className="ops-subtitle">Correlation ID</dt>
            <dd className="ops-mono">{selected.correlation_id}</dd>
            <dt className="ops-subtitle">Before</dt>
            <dd>
              <pre className="ops-mono" style={{ whiteSpace: "pre-wrap" }}>
                {selected.before_state ? JSON.stringify(selected.before_state, null, 2) : "—"}
              </pre>
            </dd>
            <dt className="ops-subtitle">After</dt>
            <dd>
              <pre className="ops-mono" style={{ whiteSpace: "pre-wrap" }}>
                {selected.after_state ? JSON.stringify(selected.after_state, null, 2) : "—"}
              </pre>
            </dd>
          </dl>
        </div>
      )}
    </div>
  );
}
