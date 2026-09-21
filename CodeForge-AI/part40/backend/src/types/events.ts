/**
 * SECURITY EVENT SYSTEM — shared vocabulary.
 * Keep this file the single source of truth for event/action/status
 * literals so the DB CHECK constraints (see db/migrations) and the
 * application code can never silently drift apart.
 */

export const SECURITY_EVENT_TYPES = [
  "LOGIN_SUCCESS",
  "LOGIN_FAILURE",
  "LOGOUT",
  "PASSWORD_CHANGE",
  "PASSWORD_RESET_REQUESTED",
  "SESSION_REVOKED",
  "ROLE_CHANGE",
  "PERMISSION_CHANGE",
  "SECURITY_CONFIGURATION_CHANGE",
  "ADMIN_ACTION",
  "AUTHORIZATION_DENIED",
  "TENANT_ISOLATION_VIOLATION",
  "RATE_LIMIT_EXCEEDED",
  "SUSPICIOUS_ACTIVITY",
  "INPUT_VALIDATION_FAILURE"
] as const;
export type SecurityEventType = (typeof SECURITY_EVENT_TYPES)[number];

export const EVENT_RESULTS = ["SUCCESS", "DENIED", "ERROR"] as const;
export type EventResult = (typeof EVENT_RESULTS)[number];

export const ALERT_SEVERITIES = ["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type AlertSeverity = (typeof ALERT_SEVERITIES)[number];

/**
 * INFO      — expected background signal, no action implied.
 * LOW       — worth surfacing on a dashboard; no paging.
 * MEDIUM    — an operator should look at this within the working day.
 * HIGH      — an operator should look at this soon; may indicate active abuse.
 * CRITICAL  — actively harmful or platform-wide; drives an incident automatically.
 */
export const ALERT_SEVERITY_MEANING: Record<AlertSeverity, string> = {
  INFO: "Expected background signal, no action implied.",
  LOW: "Worth surfacing on a dashboard; no paging.",
  MEDIUM: "An operator should look at this within the working day.",
  HIGH: "An operator should look at this soon; may indicate active abuse.",
  CRITICAL: "Actively harmful or platform-wide; auto-opens an incident."
};

export const ALERT_STATUSES = ["OPEN", "ACKNOWLEDGED", "RESOLVED"] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export const INCIDENT_STATUSES = ["OPEN", "INVESTIGATING", "MITIGATING", "MONITORING", "RESOLVED"] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const INCIDENT_TIMELINE_PHASES = [
  "DETECTION",
  "ALERT",
  "INVESTIGATION",
  "MITIGATION",
  "RECOVERY",
  "RESOLUTION",
  "NOTE"
] as const;
export type IncidentTimelinePhase = (typeof INCIDENT_TIMELINE_PHASES)[number];

export const SERVICE_HEALTH_STATUSES = ["HEALTHY", "DEGRADED", "UNAVAILABLE"] as const;
export type ServiceHealthStatus = (typeof SERVICE_HEALTH_STATUSES)[number];

export const SESSION_STATUSES = ["ACTIVE", "EXPIRED", "REVOKED", "SUSPENDED"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

/** A conservative allow-list of JSON-safe metadata. Never put secrets or raw PII here. */
export type SafeMetadata = Record<string, string | number | boolean | null>;
