import type { NextFunction, Request, Response } from "express";

export interface AuthContext {
  studentId: string;
  institutionId: string | null;
  role: "student" | "tpo" | "management";
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

/**
 * THIS IS A SEAM, NOT A REAL AUTH SYSTEM (Section 48: "Follow the existing
 * authentication and authorization system" — there wasn't one available in
 * this session to follow). Replace the body of this function with a call
 * into your real ACEAPT/PrepVista auth (verify the JWT against
 * AUTH_JWT_PUBLIC_KEY, or call your session service) and keep setting
 * `req.auth` the same shape — nothing downstream cares how it got there.
 *
 * DEV FALLBACK: with AUTH_JWT_PUBLIC_KEY unset, this trusts an `X-Student-Id`
 * header outright. That is only acceptable for local development against the
 * seeded demo data and MUST NOT ship — it is the first thing to delete when
 * wiring in real auth.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const configuredForRealAuth = Boolean(process.env.AUTH_JWT_PUBLIC_KEY);

  if (configuredForRealAuth) {
    // TODO: verify req.headers.authorization as a JWT against
    // AUTH_JWT_PUBLIC_KEY and populate req.auth from its claims. Left
    // unimplemented deliberately — a fabricated verification path would be
    // worse than an explicit "not wired up yet" error.
    res.status(501).json({
      error: "AUTH_JWT_PUBLIC_KEY is set but JWT verification isn't implemented in this reference build. " +
        "Wire src/api/middleware/auth.ts to your real auth service.",
    });
    return;
  }

  const studentId = req.header("X-Student-Id");
  if (!studentId) {
    res.status(401).json({ error: "Missing X-Student-Id header (dev-only auth fallback — see src/api/middleware/auth.ts)." });
    return;
  }
  req.auth = { studentId, institutionId: null, role: "student" };
  next();
}
