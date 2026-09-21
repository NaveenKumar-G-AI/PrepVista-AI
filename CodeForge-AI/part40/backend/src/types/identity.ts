/**
 * IDENTITY CONTEXT
 * -----------------------------------------------------------------------
 * Server-side-only representation of "who is making this request". Built
 * exclusively from a verified Supabase JWT (see middleware/identity.ts) —
 * never from client-supplied headers/body fields. Every downstream
 * authorization, tenant-isolation and audit decision reads from this
 * object, not from raw request input.
 *
 * NOTE ON ROLES: this module assumes the five-role hierarchy named in the
 * Feature 40 brief (Student -> Trainer -> TPO -> Admin -> Platform
 * Operator). No CodeForge repository was available to inspect in this
 * environment, so this is a best-effort mapping, not a confirmed schema.
 * Before wiring this into the real backend, reconcile ROLE_HIERARCHY /
 * ROLE_PERMISSIONS below against CodeForge's actual roles/permissions
 * tables and adjust — see docs/INTEGRATION_GUIDE.md.
 */

export const ROLES = ["STUDENT", "TRAINER", "TPO", "ADMIN", "PLATFORM_OPERATOR"] as const;
export type Role = (typeof ROLES)[number];

/** Ascending privilege order. Index comparison is used for "at least role X" checks. */
export const ROLE_HIERARCHY: readonly Role[] = ["STUDENT", "TRAINER", "TPO", "ADMIN", "PLATFORM_OPERATOR"];

export function roleRank(role: Role): number {
  return ROLE_HIERARCHY.indexOf(role);
}

export function roleAtLeast(role: Role, minimum: Role): boolean {
  return roleRank(role) >= roleRank(minimum);
}

/**
 * Permissions are deliberately fine-grained and explicit rather than
 * inferred purely from role rank — RBAC ("Role -> Permission -> Resource
 * -> Action -> Allow/Deny") is centralized here so nothing downstream has
 * to re-derive "is this role allowed to do X".
 */
export const PERMISSIONS = [
  // Own-scope (every authenticated role has these on their own data)
  "self:read",
  "self:submit_code",

  // Trainer-scope
  "students:read:assigned",
  "reports:read:trainer",

  // TPO / organization-scope
  "organization:manage",
  "students:read:organization",
  "students:write:organization",
  "reports:read:organization",

  // Admin-scope (org-level platform administration)
  "organization:admin",
  "security:config:write",
  "ai:config:write",
  "rate_limits:write",
  "budgets:write",
  "audit:read:organization",
  "security_events:read:organization",
  "incidents:read:organization",

  // Platform-operator-scope (cross-tenant, platform-wide)
  "audit:read:platform",
  "security_events:read:platform",
  "incidents:manage:platform",
  "alerts:manage:platform",
  "service_health:read:platform",
  "sessions:revoke:any",
  "feature_flags:write",
  "platform:admin"
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  STUDENT: ["self:read", "self:submit_code"],
  TRAINER: ["self:read", "self:submit_code", "students:read:assigned", "reports:read:trainer"],
  TPO: [
    "self:read",
    "students:read:assigned",
    "reports:read:trainer",
    "organization:manage",
    "students:read:organization",
    "students:write:organization",
    "reports:read:organization"
  ],
  ADMIN: [
    "self:read",
    "students:read:assigned",
    "reports:read:trainer",
    "organization:manage",
    "students:read:organization",
    "students:write:organization",
    "reports:read:organization",
    "organization:admin",
    "security:config:write",
    "ai:config:write",
    "rate_limits:write",
    "budgets:write",
    "audit:read:organization",
    "security_events:read:organization",
    "incidents:read:organization"
  ],
  PLATFORM_OPERATOR: [
    ...([] as Permission[]),
    "self:read",
    "organization:admin",
    "security:config:write",
    "ai:config:write",
    "rate_limits:write",
    "budgets:write",
    "audit:read:organization",
    "security_events:read:organization",
    "incidents:read:organization",
    "audit:read:platform",
    "security_events:read:platform",
    "incidents:manage:platform",
    "alerts:manage:platform",
    "service_health:read:platform",
    "sessions:revoke:any",
    "feature_flags:write",
    "platform:admin"
  ]
};

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Built once per request by middleware/identity.ts from a verified JWT +
 * (optionally) a tracked session row. Treat as read-only.
 */
export interface IdentityContext {
  userId: string;
  organizationId: string | null; // null only for platform-operator identities with no home org
  role: Role;
  sessionId: string | null; // present when app-level session tracking is active for this token
  authTime: number; // unix seconds — when the credential was originally issued
  correlationId: string;
}
