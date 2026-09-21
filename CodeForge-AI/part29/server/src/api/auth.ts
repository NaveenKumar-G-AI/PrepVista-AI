import type { NextFunction, Request, Response } from "express";
import { pool } from "../db/client.js";

export type Role = "STUDENT" | "TPO" | "ADMIN";

export interface AuthedRequest extends Request {
  auth?: { userId: string; role: Role };
}

/**
 * Minimal stand-in for real session authentication. There is no existing
 * CodeForge auth system in this environment to integrate with, so this
 * reads two headers set by whatever your real auth layer resolves
 * (typically: verify a Supabase JWT, then set these from its claims).
 * REPLACE THIS before deploying — it currently trusts the caller's
 * self-reported identity, which is fine for local development and
 * absolutely not fine in production.
 */
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const userId = req.header("x-user-id");
  const role = req.header("x-user-role") as Role | undefined;
  if (!userId || !role || !["STUDENT", "TPO", "ADMIN"].includes(role)) {
    return res.status(401).json({
      error: "UNAUTHENTICATED",
      message:
        "Missing or invalid x-user-id / x-user-role headers. This is a development stand-in — wire this up to your real session/JWT verification before deploying.",
    });
  }
  req.auth = { userId, role };
  next();
}

/**
 * Enforces the same boundary the RLS policies enforce at the database:
 * a student may only read their own data; a TPO may only read students in
 * a cohort they staff; ADMIN passes through (for internal tooling only).
 * This exists because the backend connects to Postgres as the schema owner
 * and therefore bypasses RLS — so the API layer must not rely on the
 * database to catch an authorization bug here. Both layers enforce the
 * same rule independently, which is the point.
 */
export async function requireStudentAccess(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.auth) return res.status(401).json({ error: "UNAUTHENTICATED" });
  const targetStudentId = req.params.studentId;

  if (req.auth.role === "ADMIN") return next();

  if (req.auth.role === "STUDENT") {
    if (req.auth.userId !== targetStudentId) {
      return res.status(403).json({ error: "FORBIDDEN", message: "You may only access your own growth data." });
    }
    return next();
  }

  // TPO
  const result = await pool.query(
    `select 1 from cohort_students cs
     join cohort_staff st on st.cohort_id = cs.cohort_id
     where cs.student_id = $1 and st.user_id = $2
     limit 1`,
    [targetStudentId, req.auth.userId]
  );
  if ((result.rowCount ?? 0) === 0) {
    return res.status(403).json({ error: "FORBIDDEN", message: "This student is outside your authorized cohorts." });
  }
  return next();
}

/** Cohort-level authorization for the institutional view. */
export async function requireCohortStaffAccess(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.auth) return res.status(401).json({ error: "UNAUTHENTICATED" });
  if (req.auth.role === "ADMIN") return next();
  if (req.auth.role !== "TPO") {
    return res.status(403).json({ error: "FORBIDDEN", message: "Institutional views require TPO staff access." });
  }
  const cohortId = req.params.cohortId;
  const result = await pool.query(
    `select 1 from cohort_staff where cohort_id = $1 and user_id = $2 limit 1`,
    [cohortId, req.auth.userId]
  );
  if ((result.rowCount ?? 0) === 0) {
    return res.status(403).json({ error: "FORBIDDEN", message: "You do not staff this cohort." });
  }
  return next();
}
