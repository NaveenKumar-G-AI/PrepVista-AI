import React, { useCallback, useEffect, useState } from "react";
import type { OpsClient, SecurityAlertDTO, SecurityEventDTO, IncidentDTO } from "../../api/opsClient";
import { SeverityBadge } from "../../components/ops/SeverityBadge";
import { StatusBadge } from "../../components/ops/StatusBadge";
import "../../components/ops/ops.css";

/**
 * SECURITY OPERATIONS DASHBOARD
 * -----------------------------------------------------------------------
 * Every number on this page is computed from a real API response — there
 * is no hardcoded/sample data path. Card counts are explicitly scoped to
 * "in the events/alerts this page fetched" (see the card labels) rather
 * than silently implying a global count the backend was never asked for;
 * widen the fetch limit or add a dedicated aggregate endpoint in the host
 * repo if a true platform-wide count is needed.
 */

interface Props {
  client: OpsClient;
}

const RECENT_EVENTS_LIMIT = 50;

export function SecurityOperationsDashboard({ client }: Props) {
  const [alerts, setAlerts] = useState<SecurityAlertDTO[] | null>(null);
  const [events, setEvents] = useState<SecurityEventDTO[] | null>(null);
  const [incidents, setIncidents] = useState<IncidentDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyAlertId, setBusyAlertId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [alertsRes, eventsRes, incidentsRes] = await Promise.all([
        client.listAlerts({ limit: 50 }),
        client.listSecurityEvents({ limit: RECENT_EVENTS_LIMIT }),
        client.listIncidents({ limit: 50 })
      ]);
      setAlerts(alertsRes.alerts);
      setEvents(eventsRes.events);
      setIncidents(incidentsRes.incidents);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load security operations data.");
    }
  }, [client]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAcknowledge(id: string) {
    setBusyAlertId(id);
    try {
      await client.acknowledgeAlert(id);
      await load();
    } finally {
      setBusyAlertId(null);
    }
  }

  async function handleResolve(id: string) {
    setBusyAlertId(id);
    try {
      await client.resolveAlert(id);
      await load();
    } finally {
      setBusyAlertId(null);
    }
  }

  if (error) {
    return (
      <div className="ops-dashboard">
        <div className="ops-error" role="alert">
          {error}{" "}
          <button className="ops-btn" onClick={load}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  const loading = alerts === null || events === null || incidents === null;
  const openAlerts = alerts?.filter((a) => a.status === "OPEN") ?? [];
  const highSeverityOpen = openAlerts.filter((a) => a.severity === "HIGH" || a.severity === "CRITICAL");
  const failedAuth = events?.filter((e) => e.event_type === "LOGIN_FAILURE") ?? [];
  const authzFailures = events?.filter((e) => e.event_type === "AUTHORIZATION_DENIED") ?? [];
  const suspicious = events?.filter((e) => e.event_type === "SUSPICIOUS_ACTIVITY" || e.event_type === "TENANT_ISOLATION_VIOLATION") ?? [];
  const activeIncidents = incidents?.filter((i) => i.status !== "RESOLVED") ?? [];

  return (
    <div className="ops-dashboard">
      <div className="ops-header">
        <div>
          <h2 className="ops-title">Security Operations</h2>
          <p className="ops-subtitle">Live alerts, authentication signals, and active incidents.</p>
        </div>
        <button className="ops-btn" onClick={load} disabled={loading}>
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="ops-loading">Loading security operations data…</div>
      ) : (
        <>
          <div className="ops-cards">
            <SummaryCard label="Open alerts" value={openAlerts.length} />
            <SummaryCard label="High/critical severity (open)" value={highSeverityOpen.length} />
            <SummaryCard label={`Failed logins (last ${events!.length})`} value={failedAuth.length} />
            <SummaryCard label={`Authorization failures (last ${events!.length})`} value={authzFailures.length} />
            <SummaryCard label={`Suspicious activity (last ${events!.length})`} value={suspicious.length} />
            <SummaryCard label="Active incidents" value={activeIncidents.length} />
          </div>

          <h3 className="ops-title" style={{ fontSize: 15, marginBottom: 8 }}>
            Alerts
          </h3>
          <div className="ops-panel" style={{ marginBottom: 20 }}>
            {alerts!.length === 0 ? (
              <div className="ops-empty">No alerts recorded yet.</div>
            ) : (
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Severity</th>
                    <th>Title</th>
                    <th>Occurrences</th>
                    <th>Last seen</th>
                    <th>Status</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {alerts!.map((alert) => (
                    <tr className="ops-row" key={alert.id}>
                      <td>
                        <SeverityBadge severity={alert.severity} />
                      </td>
                      <td>
                        <div>{alert.title}</div>
                        <div className="ops-mono">{alert.description}</div>
                      </td>
                      <td>{alert.occurrence_count}</td>
                      <td className="ops-mono">{new Date(alert.last_seen_at).toLocaleString()}</td>
                      <td>
                        <StatusBadge status={alert.status} />
                      </td>
                      <td>
                        {alert.status === "OPEN" && (
                          <>
                            <button className="ops-btn" disabled={busyAlertId === alert.id} onClick={() => handleAcknowledge(alert.id)}>
                              Acknowledge
                            </button>{" "}
                            <button className="ops-btn" disabled={busyAlertId === alert.id} onClick={() => handleResolve(alert.id)}>
                              Resolve
                            </button>
                          </>
                        )}
                        {alert.status === "ACKNOWLEDGED" && (
                          <button className="ops-btn" disabled={busyAlertId === alert.id} onClick={() => handleResolve(alert.id)}>
                            Resolve
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <h3 className="ops-title" style={{ fontSize: 15, marginBottom: 8 }}>
            Recent security events
          </h3>
          <div className="ops-panel">
            {events!.length === 0 ? (
              <div className="ops-empty">No security events recorded yet.</div>
            ) : (
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Event</th>
                    <th>Actor</th>
                    <th>Result</th>
                    <th>Correlation ID</th>
                  </tr>
                </thead>
                <tbody>
                  {events!.map((evt) => (
                    <tr className="ops-row" key={evt.id}>
                      <td className="ops-mono">{new Date(evt.created_at).toLocaleString()}</td>
                      <td>{evt.event_type}</td>
                      <td className="ops-mono">{evt.actor_user_id ?? "—"}</td>
                      <td>
                        <StatusBadge status={evt.result === "SUCCESS" ? "RESOLVED" : evt.result === "DENIED" ? "UNAVAILABLE" : "DEGRADED"} />
                      </td>
                      <td className="ops-mono">{evt.correlation_id}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="ops-card">
      <p className="ops-card-label">{label}</p>
      <p className="ops-card-value">{value}</p>
    </div>
  );
}
