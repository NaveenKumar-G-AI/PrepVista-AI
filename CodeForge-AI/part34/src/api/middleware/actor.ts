// ============================================================================
// Phase 61 — "Reuse existing authorization... Do not create a second
// permission system."
//
// This middleware is NOT that system. It's a deliberately simple stand-in
// that reads actor identity from headers so this reference implementation is
// runnable and testable end-to-end. WHEN INTEGRATING: replace the body of
// extractActor() with whatever already resolves the authenticated
// user/session in the main CodeForge codebase (JWT verification, session
// cookie lookup, etc.) — every route handler downstream only depends on
// `req.actor: ActorContext` and `req.orgId: OrgId`, so nothing else changes.
// ============================================================================

import type { NextFunction, Request, Response } from "express";
import { asOrgId, asStudentId, asUserId, type ActorContext, type ActorRole, type OrgId } from "../../domain/types.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      actor?: ActorContext;
      orgId?: OrgId;
    }
  }
}

const VALID_ROLES: ActorRole[] = ["STUDENT", "TRAINER", "TPO_ADMIN", "ORG_ADMIN", "SYSTEM_ADMIN"];

export function actorMiddleware() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userId = req.header("x-actor-user-id");
    const orgId = req.header("x-actor-org-id");
    const rolesHeader = req.header("x-actor-roles");
    const studentId = req.header("x-actor-student-id");

    if (!userId || !orgId || !rolesHeader) {
      res.status(401).json({
        error: "MISSING_ACTOR_HEADERS",
        message: "x-actor-user-id, x-actor-org-id, and x-actor-roles are required. Replace this middleware with your real auth before deploying.",
      });
      return;
    }

    const roles = rolesHeader
      .split(",")
      .map((r) => r.trim())
      .filter((r): r is ActorRole => (VALID_ROLES as string[]).includes(r));

    if (roles.length === 0) {
      res.status(401).json({ error: "INVALID_ACTOR_ROLES", message: `x-actor-roles must include at least one of: ${VALID_ROLES.join(", ")}` });
      return;
    }

    req.orgId = asOrgId(orgId);
    req.actor = {
      userId: asUserId(userId),
      orgId: asOrgId(orgId),
      roles,
      studentId: studentId ? asStudentId(studentId) : undefined,
    };
    next();
  };
}
