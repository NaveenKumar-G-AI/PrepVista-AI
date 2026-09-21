import type { NextFunction, Request, Response } from "express";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      tenantId: string;
      studentId: string;
    }
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Stand-in for real ACEAPT session/auth (Section 41: "adapt to the
 * project's existing schema conventions"). This reference build has no
 * login system of its own -- it trusts `x-tenant-id` / `x-student-id`
 * headers so the API is exercisable end-to-end. Replace this file's body
 * with a call into the real ACEAPT session layer when PATH is wired into
 * the live backend; every route downstream only ever reads
 * `req.tenantId` / `req.studentId`, so nothing else needs to change.
 */
export function devAuth(req: Request, res: Response, next: NextFunction): void {
  const tenantId = req.header("x-tenant-id");
  const studentId = req.header("x-student-id");

  if (!tenantId || !UUID_RE.test(tenantId)) {
    res.status(401).json({ error: "missing or invalid x-tenant-id header" });
    return;
  }
  if (!studentId || !UUID_RE.test(studentId)) {
    res.status(401).json({ error: "missing or invalid x-student-id header" });
    return;
  }
  req.tenantId = tenantId;
  req.studentId = studentId;
  next();
}
