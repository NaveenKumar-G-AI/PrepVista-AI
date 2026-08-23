import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { userAccount } from "../../db/schema";
import { can, type Actor } from "../../lib/permissions";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      actor?: Actor;
    }
  }
}

/**
 * DEMO AUTH ONLY — resolves the acting user from an `x-actor-id` header
 * against user_account. This is a placeholder so the API is runnable and
 * testable standalone. Replace with real session/JWT auth when
 * integrating; everything downstream (routes, services) only depends on
 * `req.actor` matching the `Actor` shape in src/lib/permissions.ts, not on
 * how it was resolved.
 */
export async function attachActor(req: Request, res: Response, next: NextFunction) {
  const actorId = req.header("x-actor-id");
  if (!actorId) return res.status(401).json({ error: "Missing x-actor-id header (demo auth — replace with real auth)" });

  const [account] = await db.select().from(userAccount).where(eq(userAccount.id, actorId));
  if (!account) return res.status(401).json({ error: "Unknown actor" });

  req.actor = {
    id: account.id,
    institutionId: account.institutionId,
    role: account.role,
    scopeDepartment: account.scopeDepartment,
    linkedStudentId: account.linkedStudentId,
  };
  next();
}

export function requireCapability(capability: Parameters<typeof can>[1]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.actor || !can(req.actor, capability)) {
      return res.status(403).json({ error: "Not authorized for this action" });
    }
    next();
  };
}

export function requireRole(...roles: Actor["role"][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.actor || !roles.includes(req.actor.role)) {
      return res.status(403).json({ error: `Requires one of: ${roles.join(", ")}` });
    }
    next();
  };
}
