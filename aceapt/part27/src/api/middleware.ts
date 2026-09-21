import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env.js";

export type Role = "student" | "trainer" | "tpo" | "admin";
export interface AuthedUser {
  id: string;
  role: Role;
}

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthedUser;
  }
}

/**
 * DEV-ONLY convenience so the API is exercisable without wiring real auth —
 * populates req.user from headers, and only runs when NODE_ENV !== production.
 * DELETE THIS and mount your real PrepVista auth middleware in its place;
 * every route below only depends on req.user being populated, not on how.
 */
export function devAuthFallback(req: Request, _res: Response, next: NextFunction): void {
  if (!env.isProduction && !req.user) {
    const id = req.header("x-dev-student-id");
    const role = (req.header("x-dev-role") as Role | undefined) ?? "student";
    if (id) req.user = { id, role };
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Not authenticated." });
    return;
  }
  next();
}

const STAFF_ROLES: Role[] = ["trainer", "tpo", "admin"];

/** Students may only view their own forecast; staff roles may view any
 * (spec section 62: "protect student and institutional data"). */
export function requireSelfOrStaff(paramName = "studentId") {
  return (req: Request, res: Response, next: NextFunction): void => {
    const targetId = requireStringParam(req, paramName);
    const isStaff = req.user != null && STAFF_ROLES.includes(req.user.role);
    if (!isStaff && req.user?.id !== targetId) {
      res.status(403).json({ error: "Not authorized to view this student's forecast." });
      return;
    }
    next();
  };
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: "Not authorized." });
      return;
    }
    next();
  };
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  console.error(err);
  const message = err instanceof Error ? err.message : "Unexpected error.";
  res.status(500).json({ error: message });
}

/** Express 5's ParamsDictionary types each param as `string | string[]` (to
 * support wildcard/repeated captures) even though none of this API's routes
 * use wildcards. This narrows a named param to a plain string or throws — a
 * malformed URL is a 400, not a silent array-vs-string bug downstream. */
export function requireStringParam(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Expected route parameter "${name}" to be a non-empty string.`);
  }
  return value;
}
