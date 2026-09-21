import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env";

/**
 * ADMIN SECURITY — step-up auth for destructive/high-impact operations.
 * -----------------------------------------------------------------------
 * A session that has been alive for hours is still a valid session, but
 * for genuinely dangerous actions (revoking every session in an org,
 * disabling AI provider access platform-wide, changing another user's
 * role) we additionally require that the *credential* was issued
 * recently — i.e. the user actually re-authenticated a short time ago,
 * not just that their long-lived token happens to still be valid. This
 * is a lightweight stand-in for step-up/MFA re-prompt: if CodeForge later
 * adds MFA, this is the hook point to require a fresh MFA challenge
 * instead of only checking token recency.
 *
 * Mount AFTER identityMiddleware and requirePermission() — this narrows
 * an already-authorized request further, it does not replace RBAC.
 */
export function requireRecentAuth(req: Request, res: Response, next: NextFunction) {
  const identity = req.identity;
  if (!identity) return res.status(401).json({ error: "unauthenticated" });

  const ageSeconds = Math.floor(Date.now() / 1000) - identity.authTime;
  if (ageSeconds > env.RECENT_AUTH_WINDOW_SECONDS) {
    return res.status(401).json({
      error: "reauthentication_required",
      message: "This action requires a recently-issued credential. Please sign in again and retry."
    });
  }

  next();
}
