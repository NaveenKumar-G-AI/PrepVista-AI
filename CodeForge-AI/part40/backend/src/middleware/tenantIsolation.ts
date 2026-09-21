import type { Request, Response, NextFunction } from "express";
import { emitSecurityEvent } from "../security/securityEvents.service";

/**
 * TENANT VALIDATION
 * -----------------------------------------------------------------------
 * Sits between Authorization and the feature handler (see app.ts for the
 * mounted order, matching the brief's
 * Authentication -> Authorization -> Tenant Validation -> ... pipeline).
 * Two jobs:
 *
 *  1. requireOrgParamMatch — for routes where an organization id appears
 *     directly in the path (e.g. /organizations/:organizationId/...):
 *     deny outright, with a security event, if it doesn't match the
 *     caller's own org (platform operators exempted).
 *
 *  2. resolveOrgScope — for routes where the "which org" is implicit
 *     (search/list endpoints): returns the org id every downstream query
 *     must be scoped to. A non-platform-operator is always scoped to
 *     their own org, full stop, regardless of what a `?organizationId=`
 *     query param says — this is what stops a crafted query string from
 *     ever becoming a cross-tenant read. A platform operator MAY narrow
 *     to one org via that same query param, or omit it for a
 *     platform-wide view (still bounded by RLS — see db/tenantContext.ts).
 */

export async function requireOrgParamMatch(req: Request, res: Response, next: NextFunction) {
  const identity = req.identity;
  if (!identity) return res.status(401).json({ error: "unauthenticated" });
  if (identity.role === "PLATFORM_OPERATOR") return next();

  const paramOrgId = req.params.organizationId;
  if (paramOrgId && paramOrgId !== identity.organizationId) {
    await emitSecurityEvent({
      eventType: "TENANT_ISOLATION_VIOLATION",
      actorUserId: identity.userId,
      actorRole: identity.role,
      organizationId: identity.organizationId,
      resourceType: "organization",
      resourceId: paramOrgId,
      result: "DENIED",
      correlationId: identity.correlationId,
      ipAddress: req.ip,
      metadata: { route: req.path }
    });
    return res.status(404).json({ error: "not_found" });
  }

  next();
}

/** Returns the organization id the current request's queries must be scoped to, or null for an intentional platform-wide (operator-only) view. */
export function resolveOrgScope(req: Request): string | null {
  const identity = req.identity;
  if (!identity) throw new Error("resolveOrgScope called before identityMiddleware");

  if (identity.role !== "PLATFORM_OPERATOR") {
    return identity.organizationId; // never influenced by client-supplied query params
  }

  const requested = typeof req.query.organizationId === "string" ? req.query.organizationId : null;
  return requested; // null => platform-wide, still RLS-bounded
}
