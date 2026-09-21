import React, { useCallback, useEffect, useState } from "react";
import type { OpsClient, IncidentDTO } from "../../api/opsClient";
import { SeverityBadge } from "../../components/ops/SeverityBadge";
import { StatusBadge } from "../../components/ops/StatusBadge";
import "../../components/ops/ops.css";

interface Props {
  client: OpsClient;
}

const NEXT_STATUS: Record<string, string[]> = {
  OPEN: ["INVESTIGATING", "RESOLVED"],
  INVESTIGATING: ["MITIGATING", "MONITORING", "RESOLVED"],
  MITIGATING: ["MONITORING", "RESOLVED"],
  MONITORING: ["RESOLVED", "INVESTIGATING"],
  RESOLVED: []
};

export function IncidentCenter({ client }: Props) {
  const [incidents, setIncidents] = useState<IncidentDTO[] | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<IncidentDTO | null>(null);
  const [note, setNote] = useState("");
  const [nextStatus, setNextStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await client.listIncidents({ status: statusFilter || undefined, limit: 50 });
      setIncidents(res.incidents);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load incidents.");
    }
  }, [client, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const loadDetail = useCallback(
    async (id: string) => {
      const res = await client.getIncident(id);
      setDetail(res.incident);
      const options = NEXT_STATUS[res.incident.status] ?? [];
      setNextStatus(options[0] ?? "");
    },
    [client]
  );

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId, loadDetail]);

  async function handleTransition() {
    if (!selectedId || !nextStatus || !note.trim()) return;
    setBusy(true);
    try {
      await client.transitionIncident(selectedId, nextStatus, note.trim());
      setNote("");
      await loadDetail(selectedId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transition failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ops-dashboard">
      <div className="ops-header">
        <div>
          <h2 className="ops-title">Incident Center</h2>
          <p className="ops-subtitle">Active and past incidents, with full timelines and operator workflow.</p>
        </div>
        <button className="ops-btn" onClick={load}>
          Refresh
        </button>
      </div>

      <div className="ops-toolbar">
        <select
          className="ops-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="OPEN">Open</option>
          <option value="INVESTIGATING">Investigating</option>
          <option value="MITIGATING">Mitigating</option>
          <option value="MONITORING">Monitoring</option>
          <option value="RESOLVED">Resolved</option>
        </select>
      </div>

      {error && (
        <div className="ops-error" role="alert">
          {error}
        </div>
      )}

      <div className="ops-panel">
        {incidents === null ? (
          <div className="ops-loading">Loading incidents…</div>
        ) : incidents.length === 0 ? (
          <div className="ops-empty">No incidents match this filter.</div>
        ) : (
          <table className="ops-table">
            <thead>
              <tr>
                <th>Severity</th>
                <th>Title</th>
                <th>Affected services</th>
                <th>Status</th>
                <th>Opened</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((incident) => (
                <tr
                  className="ops-row"
                  key={incident.id}
                  tabIndex={0}
                  role="button"
                  aria-label={`View incident ${incident.title}`}
                  style={{ cursor: "pointer" }}
                  onClick={() => setSelectedId(incident.id)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSelectedId(incident.id)}
                >
                  <td>
                    <SeverityBadge severity={incident.severity} />
                  </td>
                  <td>{incident.title}</td>
                  <td>{incident.affected_services.length ? incident.affected_services.join(", ") : "—"}</td>
                  <td>
                    <StatusBadge status={incident.status} />
                  </td>
                  <td className="ops-mono">{new Date(incident.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {detail && (
        <div className="ops-detail-panel">
          <div className="ops-header" style={{ marginBottom: 12 }}>
            <div>
              <h3 className="ops-title" style={{ fontSize: 15 }}>
                {detail.title}
              </h3>
              <p className="ops-subtitle">
                <SeverityBadge severity={detail.severity} /> <StatusBadge status={detail.status} />
              </p>
            </div>
            <button className="ops-btn" onClick={() => setSelectedId(null)} aria-label="Close incident detail">
              Close
            </button>
          </div>

          <h4 className="ops-subtitle" style={{ marginBottom: 8 }}>
            Timeline
          </h4>
          <ol className="ops-timeline">
            {(detail.timeline ?? []).map((t) => (
              <li key={t.id}>
                <div className="ops-timeline-phase">
                  {t.phase} · {new Date(t.created_at).toLocaleString()}
                </div>
                <p className="ops-timeline-desc">{t.description}</p>
              </li>
            ))}
          </ol>

          {(() => {
            const nextOptions = NEXT_STATUS[detail.status] ?? [];
            return (
              nextOptions.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <h4 className="ops-subtitle" style={{ marginBottom: 8 }}>
                    Transition
                  </h4>
                  <div className="ops-toolbar">
                    <select className="ops-select" value={nextStatus} onChange={(e) => setNextStatus(e.target.value)} aria-label="Next status">
                      {nextOptions.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                    <input
                      className="ops-input"
                      style={{ flex: 1, minWidth: 240 }}
                      placeholder="What happened / what changed (required)"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      aria-label="Transition note"
                    />
                    <button className="ops-btn ops-btn-primary" disabled={busy || !note.trim()} onClick={handleTransition}>
                      {busy ? "Submitting…" : "Submit"}
                    </button>
                  </div>
                </div>
              )
            );
          })()}

          {detail.status === "RESOLVED" && <PostmortemForm client={client} incident={detail} onSaved={() => loadDetail(detail.id)} />}
        </div>
      )}
    </div>
  );
}

function PostmortemForm({ client, incident, onSaved }: { client: OpsClient; incident: IncidentDTO; onSaved: () => void }) {
  const [fields, setFields] = useState({
    impact: incident.postmortem_impact ?? "",
    rootCause: incident.postmortem_root_cause ?? "",
    detection: "",
    mitigation: "",
    recovery: "",
    correctiveActions: ""
  });
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await client.recordPostmortem(incident.id, fields);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <h4 className="ops-subtitle" style={{ marginBottom: 8 }}>
        Postmortem
      </h4>
      {(Object.keys(fields) as Array<keyof typeof fields>).map((key) => (
        <div key={key} style={{ marginBottom: 8 }}>
          <label className="ops-subtitle" style={{ display: "block", marginBottom: 4, textTransform: "capitalize" }}>
            {key.replace(/([A-Z])/g, " $1")}
          </label>
          <input
            className="ops-input"
            style={{ width: "100%" }}
            value={fields[key]}
            onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
          />
        </div>
      ))}
      <button className="ops-btn ops-btn-primary" disabled={saving} onClick={save}>
        {saving ? "Saving…" : "Save postmortem"}
      </button>
    </div>
  );
}
