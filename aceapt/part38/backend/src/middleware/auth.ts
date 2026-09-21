import { NextFunction, Request, Response } from "express";

/**
 * ACEAPT already has its own authentication/session system, which does not
 * exist in this environment. This stub only demonstrates the SHAPE of a
 * student-level access check (spec section 63) so the routes are not left
 * wide open by default. Replace the body with a call into the real
 * auth/session/JWT middleware before this goes anywhere near production —
 * do not deploy this as-is.
 */
export function requireStudentAccess(req: Request, res: Response, next: NextFunction): void {
  const requestedStudentId = req.params.studentId;
  const authenticatedStudentId = req.header("x-student-id"); // TODO: replace with real session/JWT claim

  if (!authenticatedStudentId) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[auth] No x-student-id header present; allowing request because NODE_ENV is not 'production'.");
      next();
      return;
    }
    res.status(401).json({ error: "Unauthenticated" });
    return;
  }

  if (authenticatedStudentId !== requestedStudentId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  next();
}
