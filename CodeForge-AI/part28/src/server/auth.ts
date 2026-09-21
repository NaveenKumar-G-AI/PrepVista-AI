import type { Request, Response, NextFunction } from "express";
import type { RequestingSession } from "../lib/growth/authorization.ts";

/**
 * ---------------------------------------------------------------------------
 * DEV-ONLY AUTH SHIM — replace before deploying.
 * ---------------------------------------------------------------------------
 * Real CodeForge already has Supabase Auth. In production this middleware
 * should verify the incoming Supabase JWT (e.g. `supabase.auth.getUser(jwt)`
 * on the server, or JWKS verification) and populate `req.session` from the
 * verified claims — never from a header the caller can set arbitrarily.
 *
 * For this standalone reference build there is no real Supabase project to
 * verify against (keys/secrets were left blank on request), so this shim
 * accepts `Authorization: Bearer <userId>` or `Authorization: Bearer
 * <userId>:instructor` purely so the authorization/assessment-mode logic
 * can be exercised end-to-end over real HTTP. It must not ship like this.
 * ---------------------------------------------------------------------------
 */
declare global {
  namespace Express {
    interface Request {
      session: RequestingSession | null;
    }
  }
}

export function devAuthMiddleware(req: Request, _res: Response, next: NextFunction) {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    req.session = null;
    return next();
  }
  const token = header.slice("Bearer ".length);
  const [userId, role] = token.split(":");
  req.session = userId ? { userId, isInstructor: role === "instructor" } : null;
  next();
}
