/**
 * Thin fetch wrapper for Feature 40's API. Deliberately framework-agnostic
 * (no assumption about the host app's HTTP client, state library, or auth
 * storage) — `createOpsClient` takes a `getToken` function so the real
 * CodeForge frontend can plug in however it already retrieves the current
 * Supabase session token. No request here ever fabricates or caches data
 * client-side; every dashboard call hits a real endpoint and renders
 * exactly what came back (see docs/INTEGRATION_GUIDE.md for wiring this
 * into the actual app shell/router).
 */

export interface OpsClientConfig {
  baseUrl: string; // e.g. "/api" if proxied, or "https://api.codeforge.example/api"
  getToken: () => Promise<string | null> | string | null;
}

export class ApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`API request failed with status ${status}`);
    this.name = "ApiError";
  }
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const usable = Object.entries(params).filter(([, v]) => v !== undefined && v !== "");
  if (usable.length === 0) return "";
  return "?" + usable.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&");
}

export function createOpsClient(config: OpsClientConfig) {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = await config.getToken();
    const res = await fetch(`${config.baseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {})
      }
    });

    const body = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, body);
    return body as T;
  }

  return {
    // ---- Security events + alerts ----
    listSecurityEvents: (filters: { eventType?: string; result?: string; from?: string; to?: string; limit?: number; offset?: number } = {}) =>
      request<{ events: SecurityEventDTO[]; limit: number; offset: number }>(`/security/events${buildQuery(filters)}`),

    listAlerts: (filters: { status?: string; limit?: number; offset?: number } = {}) =>
      request<{ alerts: SecurityAlertDTO[]; limit: number; offset: number }>(`/security/alerts${buildQuery(filters)}`),

    acknowledgeAlert: (id: string) => request<{ alert: SecurityAlertDTO }>(`/security/alerts/${id}/acknowledge`, { method: "PATCH" }),
    resolveAlert: (id: string) => request<{ alert: SecurityAlertDTO }>(`/security/alerts/${id}/resolve`, { method: "PATCH" }),

    // ---- Audit ----
    listAuditEvents: (
      filters: { actorUserId?: string; action?: string; resourceType?: string; result?: string; from?: string; to?: string; limit?: number; offset?: number } = {}
    ) => request<{ events: AuditEventDTO[]; limit: number; offset: number }>(`/audit/events${buildQuery(filters)}`),

    getAuditEvent: (id: string) => request<{ event: AuditEventDTO }>(`/audit/events/${id}`),

    // ---- Incidents ----
    listIncidents: (filters: { status?: string; limit?: number; offset?: number } = {}) =>
      request<{ incidents: IncidentDTO[]; limit: number; offset: number }>(`/incidents${buildQuery(filters)}`),

    getIncident: (id: string) => request<{ incident: IncidentDTO }>(`/incidents/${id}`),

    createIncident: (input: { title: string; severity: string; organizationId: string | null; affectedServices: string[]; detectionNote: string }) =>
      request<{ incident: IncidentDTO }>(`/incidents`, { method: "POST", body: JSON.stringify(input) }),

    transitionIncident: (id: string, status: string, note: string) =>
      request<{ incident: IncidentDTO }>(`/incidents/${id}/status`, { method: "PATCH", body: JSON.stringify({ status, note }) }),

    recordPostmortem: (id: string, postmortem: Record<string, string>) =>
      request<{ incident: IncidentDTO }>(`/incidents/${id}/postmortem`, { method: "PUT", body: JSON.stringify(postmortem) }),

    // ---- Health ----
    getDependencyHealth: () => request<DependencyHealthReportDTO>(`/health/dependencies`),
    getDependencyHistory: (service: string, limit = 50) =>
      request<{ snapshots: DependencySnapshotDTO[] }>(`/health/dependencies/${encodeURIComponent(service)}/history${buildQuery({ limit })}`),

    // ---- Sessions ----
    listOwnSessions: () => request<{ sessions: SessionDTO[] }>(`/sessions/me`),
    revokeSession: (id: string, reason = "user_initiated") =>
      request<{ session: SessionDTO }>(`/sessions/${id}/revoke`, { method: "POST", body: JSON.stringify({ reason }) })
  };
}

export type OpsClient = ReturnType<typeof createOpsClient>;

// ---- DTO shapes (mirror the backend's row shapes; kept intentionally loose/permissive) ----

export interface SecurityEventDTO {
  id: string;
  event_type: string;
  actor_user_id: string | null;
  actor_role: string | null;
  organization_id: string | null;
  resource_type: string | null;
  resource_id: string | null;
  result: "SUCCESS" | "DENIED" | "ERROR";
  correlation_id: string;
  created_at: string;
  metadata: Record<string, unknown>;
}

export interface SecurityAlertDTO {
  id: string;
  rule_id: string;
  severity: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "ACKNOWLEDGED" | "RESOLVED";
  title: string;
  description: string;
  organization_id: string | null;
  occurrence_count: number;
  first_seen_at: string;
  last_seen_at: string;
  incident_id: string | null;
}

export interface AuditEventDTO {
  id: string;
  actor_user_id: string | null;
  actor_role: string | null;
  organization_id: string | null;
  action: string;
  event_type: string;
  resource_type: string | null;
  resource_id: string | null;
  result: "SUCCESS" | "DENIED" | "ERROR";
  before_state: unknown;
  after_state: unknown;
  metadata: Record<string, unknown>;
  correlation_id: string;
  created_at: string;
}

export interface IncidentTimelineEventDTO {
  id: string;
  phase: string;
  description: string;
  actor_user_id: string | null;
  created_at: string;
}

export interface IncidentDTO {
  id: string;
  title: string;
  severity: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "INVESTIGATING" | "MITIGATING" | "MONITORING" | "RESOLVED";
  organization_id: string | null;
  affected_services: string[];
  created_at: string;
  resolved_at: string | null;
  timeline?: IncidentTimelineEventDTO[];
  postmortem_impact?: string | null;
  postmortem_root_cause?: string | null;
}

export interface DependencyCheckResultDTO {
  name: string;
  status: "HEALTHY" | "DEGRADED" | "UNAVAILABLE";
  latencyMs: number;
  essential: boolean;
  error?: string;
}

export interface DependencyHealthReportDTO {
  overall: "HEALTHY" | "DEGRADED" | "UNAVAILABLE";
  checkedAt: string;
  dependencies: DependencyCheckResultDTO[];
}

export interface DependencySnapshotDTO {
  id: string;
  service_name: string;
  status: string;
  latency_ms: number | null;
  error_message: string | null;
  checked_at: string;
}

export interface SessionDTO {
  id: string;
  device_label: string | null;
  approximate_location: string | null;
  status: "ACTIVE" | "EXPIRED" | "REVOKED" | "SUSPENDED";
  created_at: string;
  last_active_at: string;
  expires_at: string;
}
