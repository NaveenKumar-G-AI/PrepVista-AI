import type { Request, Response, NextFunction } from "express";
import { roleHasPermission, type Permission } from "../types/identity";
import { emitSecurityEvent } from "../security/securityEvents.service";

/**
 * SERVER-SIDE AUTHORIZATION + PRIVILEGE ESCALATION PROTECTION
 * -----------------------------------------------------------------------
 * Every privileged backend operation verifies authorization independently
 * of the frontend, from `req.identity` (built by identity middleware from
 * a verified JWT — see middleware/identity.ts) — never from a client-
 * supplied role/permission field. requirePermission() is the single place
 * "does this role get to do this" is decided; do not duplicate that
 * decision ad hoc inside individual route handlers.
 *
 * FAIL-CLOSED: if `req.identity` is missing (identityMiddleware wasn't
 * mounted, or was bypassed somehow), this denies rather than assuming a
 * permissive default. A missing precondition is a bug to surface loudly,
 * not an implicit "allow".
 */

export function requirePermission(permission: Permission) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const identity = req.identity;

    if (!identity) {
      // Defensive — should be unreachable if middleware order is correct
      // (see app.ts), but fail closed rather than trust an absent identity.
      return res.status(401).json({ error: "unauthenticated" });
    }

    if (!roleHasPermission(identity.role, permission)) {
      await emitSecurityEvent({
        eventType: "AUTHORIZATION_DENIED",
        actorUserId: identity.userId,
        actorRole: identity.role,
        organizationId: identity.organizationId,
        resourceType: req.path,
        result: "DENIED",
        correlationId: identity.correlationId,
        ipAddress: req.ip,
        metadata: { requiredPermission: permission, method: req.method }
      });
      return res.status(403).json({ error: "forbidden", message: "You do not have permission to perform this action." });
    }

    next();
  };
}

/**
 * RESOURCE-LEVEL AUTHORIZATION — prevents insecure direct object
 * references. `loadOwnerOrgId` looks up the resource named by the route
 * and returns the organization_id it actually belongs to; if that
 * doesn't match the caller's organization (and the caller isn't a
 * platform operator), the request is denied before the handler ever runs.
 * A valid account must never automatically grant access to every
 * resource just because the role check above passed.
 */
export function requireResourceInOrg(loadOwnerOrgId: (req: Request) => Promise<string | null>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const identity = req.identity;
    if (!identity) return res.status(401).json({ error: "unauthenticated" });

    if (identity.role === "PLATFORM_OPERATOR") return next(); // legitimate cross-tenant role, still logged by tenantIsolation.ts on DB reads

    let ownerOrgId: string | null;
    try {
      ownerOrgId = await loadOwnerOrgId(req);
    } catch (err) {
      return next(err);
    }

    if (ownerOrgId === null) {
      return res.status(404).json({ error: "not_found" });
    }

    if (ownerOrgId !== identity.organizationId) {
      await emitSecurityEvent({
        eventType: "TENANT_ISOLATION_VIOLATION",
        actorUserId: identity.userId,
        actorRole: identity.role,
        organizationId: identity.organizationId,
        resourceType: req.path,
        resourceId: req.params.id,
        result: "DENIED",
        correlationId: identity.correlationId,
        ipAddress: req.ip,
        metadata: { attemptedOrganizationId: ownerOrgId }
      });
      // 404, not 403: do not confirm the resource exists in another tenant.
      return res.status(404).json({ error: "not_found" });
    }

    next();
  };
}
