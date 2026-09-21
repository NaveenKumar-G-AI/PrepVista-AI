import React, { useCallback, useEffect, useState } from "react";
import type { OpsClient, DependencyHealthReportDTO, DependencySnapshotDTO } from "../../api/opsClient";
import { StatusBadge } from "../../components/ops/StatusBadge";
import "../../components/ops/ops.css";

interface Props {
  client: OpsClient;
  /** Polling interval in ms. Set to 0 to disable auto-refresh. Defaults to 30s. */
  pollIntervalMs?: number;
}

export function ServiceHealthCenter({ client, pollIntervalMs = 30_000 }: Props) {
  const [report, setReport] = useState<DependencyHealthReportDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [history, setHistory] = useState<DependencySnapshotDTO[] | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await client.getDependencyHealth();
      setReport(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load service health. You may need service_health:read:platform access.");
    }
  }, [client]);

  useEffect(() => {
    load();
    if (!pollIntervalMs) return;
    const id = setInterval(load, pollIntervalMs);
    return () => clearInterval(id);
  }, [load, pollIntervalMs]);

  useEffect(() => {
    if (!selected) {
      setHistory(null);
      return;
    }
    client
      .getDependencyHistory(selected, 20)
      .then((res) => setHistory(res.snapshots))
      .catch(() => setHistory([]));
  }, [selected, client]);

  return (
    <div className="ops-dashboard">
      <div className="ops-header">
        <div>
          <h2 className="ops-title">Service Health</h2>
          <p className="ops-subtitle">
            {pollIntervalMs ? `Auto-refreshing every ${Math.round(pollIntervalMs / 1000)}s.` : "Manual refresh."} Every status below comes from an
            actual probe of the dependency — nothing here is simulated.
          </p>
        </div>
        <button className="ops-btn" onClick={load}>
          Refresh now
        </button>
      </div>

      {error && (
        <div className="ops-error" role="alert">
          {error}
        </div>
      )}

      {!error && !report && <div className="ops-loading">Checking dependency health…</div>}

      {report && (
        <>
          <div className="ops-cards" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
            <div className="ops-card">
              <p className="ops-card-label">Overall platform status</p>
              <p className="ops-card-value">
                <StatusBadge status={report.overall} />
              </p>
              <p className="ops-subtitle" style={{ marginTop: 8 }}>
                Checked {new Date(report.checkedAt).toLocaleTimeString()}
              </p>
            </div>
          </div>

          <div className="ops-panel">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Dependency</th>
                  <th>Status</th>
                  <th>Latency</th>
                  <th>Essential</th>
                  <th>Error</th>
                </tr>
              </thead>
              <tbody>
                {report.dependencies.map((dep) => (
                  <tr
                    className="ops-row"
                    key={dep.name}
                    tabIndex={0}
                    role="button"
                    aria-label={`View history for ${dep.name}`}
                    style={{ cursor: "pointer" }}
                    onClick={() => setSelected(dep.name)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSelected(dep.name)}
                  >
                    <td>{dep.name.replace(/_/g, " ")}</td>
                    <td>
                      <StatusBadge status={dep.status} />
                    </td>
                    <td className="ops-mono">{dep.latencyMs}ms</td>
                    <td>{dep.essential ? "Yes — outage takes the platform down" : "No — degrades gracefully"}</td>
                    <td className="ops-mono">{dep.error ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selected && (
            <div className="ops-detail-panel">
              <div className="ops-header" style={{ marginBottom: 12 }}>
                <h3 className="ops-title" style={{ fontSize: 15 }}>
                  {selected.replace(/_/g, " ")} — recent checks
                </h3>
                <button className="ops-btn" onClick={() => setSelected(null)} aria-label="Close history panel">
                  Close
                </button>
              </div>
              {history === null ? (
                <div className="ops-loading">Loading history…</div>
              ) : history.length === 0 ? (
                <div className="ops-empty">No historical snapshots yet for this dependency.</div>
              ) : (
                <table className="ops-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Status</th>
                      <th>Latency</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((snap) => (
                      <tr key={snap.id}>
                        <td className="ops-mono">{new Date(snap.checked_at).toLocaleString()}</td>
                        <td>
                          <StatusBadge status={snap.status} />
                        </td>
                        <td className="ops-mono">{snap.latency_ms ?? "—"}ms</td>
                        <td className="ops-mono">{snap.error_message ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
