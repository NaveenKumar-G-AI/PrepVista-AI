import type { NextFunction, Request, Response } from "express";

/**
 * ============================================================================
 * AUTH CONTRACT PLACEHOLDER - NOT REAL AUTHENTICATION (Phase 50-51)
 * ============================================================================
 * This does NOT verify a session or JWT. It exists only to define the
 * SHAPE the rest of this feature expects from `req.auth`, so routes,
 * tests, and the authorization checks below can be written against a
 * stable contract. Replace the body of `authContext` with your real
 * CodeForge authentication middleware before this handles real traffic -
 * do not ship this stub to production.
 *
 * The contract: req.auth = { userId, organizationId, role, studentId? }
 * `organizationId` MUST come from verified server-side session data, never
 * from a client-supplied header/param (Phase 51: "Never accept
 * authoritative values from the frontend").
 */
export interface AuthContext {
  userId: string;
  organizationId: string;
  role: "student" | "trainer" | "org_admin" | "system_admin";
  studentId?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export function authContext(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers["x-debug-auth"]; // placeholder ONLY - see file banner above
  if (!header || typeof header !== "string") {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    req.auth = JSON.parse(header) as AuthContext;
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}

/**
 * Implements Phase 50 (reuse existing permissions) as a CONTRACT: a
 * student may only ever see their own gap profile; trainers/org admins/
 * system admins may see students within their organization. Organization
 * scoping itself is enforced by always querying with `req.auth.organizationId`
 * (never a client-supplied one) plus the database RLS policies as a second
 * layer (Phase 49) - this middleware is the first layer, not the only one.
 */
export function requireStudentAccess(req: Request, res: Response, next: NextFunction): void {
  const auth = req.auth;
  const { studentId } = req.params;
  if (!auth) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const isSelf = auth.role === "student" && auth.studentId === studentId;
  const isStaff = auth.role === "trainer" || auth.role === "org_admin" || auth.role === "system_admin";
  if (!isSelf && !isStaff) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  // eslint-disable-next-line no-console
  console.error(err);
  const message = err instanceof Error ? err.message : "Unexpected error";
  const isKnownNotFound = message.startsWith("Unknown role") || message.startsWith("Unknown student");
  res.status(isKnownNotFound ? 404 : 500).json({
    error: isKnownNotFound ? message : "Internal error calculating role skill gaps.",
  });
}
