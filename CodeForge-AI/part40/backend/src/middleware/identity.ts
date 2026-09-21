import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { ROLES, type IdentityContext, type Role } from "../types/identity";
import { emitSecurityEvent } from "../security/securityEvents.service";
import { baseLogger } from "../lib/logger";

/**
 * IDENTITY CONTEXT — the frontend is never the security boundary.
 * -----------------------------------------------------------------------
 * CodeForge authenticates users via Supabase; this middleware does not
 * reimplement login. It verifies the Supabase-issued access token on
 * every request and reconstructs IdentityContext from *verified claims
 * only*. It never reads req.body.userId / req.headers['x-role'] / any
 * other client-suppliable field for identity — that is exactly the
 * "trusting client-supplied identity" mistake this feature exists to
 * close off.
 *
 * Expected claim shape (standard Supabase access token):
 *   sub                -> userId
 *   app_metadata.role   -> Role            (set server-side by CodeForge today; NOT user-editable)
 *   app_metadata.organization_id -> organizationId
 *   iat                 -> authTime
 *   session_id (custom claim, optional) -> ties the token to an app_session row
 *
 * If your real CodeForge JWT shapes these differently, this is the one
 * function to adjust — see docs/INTEGRATION_GUIDE.md.
 */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      identity?: IdentityContext;
    }
  }
}

interface SupabaseAccessTokenClaims {
  sub: string;
  iat: number;
  exp: number;
  app_metadata?: { role?: string; organization_id?: string };
  session_id?: string;
}

function isKnownRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

function verifyClaims(token: string): SupabaseAccessTokenClaims {
  // HS256 shared-secret is the common Supabase default. If the project
  // uses RS256/JWKS instead, replace this verify call with a JWKS-backed
  // verifier (e.g. `jwks-rsa` + `jsonwebtoken`) keyed off
  // env.SUPABASE_JWKS_URL — the rest of this file is unaffected either way.
  if (!env.SUPABASE_JWT_SECRET) {
    throw new Error("No JWT verification strategy configured (SUPABASE_JWT_SECRET unset).");
  }
  return jwt.verify(token, env.SUPABASE_JWT_SECRET, { algorithms: ["HS256"] }) as SupabaseAccessTokenClaims;
}

export async function identityMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.header("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;

  if (!token) {
    return res.status(401).json({ error: "unauthenticated", message: "Missing or malformed Authorization header." });
  }

  let claims: SupabaseAccessTokenClaims;
  try {
    claims = verifyClaims(token);
  } catch (err) {
    // FAIL CLOSED: any verification failure (expired, bad signature,
    // malformed) is treated identically — 401, no partial trust.
    await emitSecurityEvent({
      eventType: "LOGIN_FAILURE",
      actorUserId: null,
      actorRole: null,
      organizationId: null,
      result: "DENIED",
      correlationId: req.correlationId,
      ipAddress: req.ip,
      metadata: { reason: err instanceof Error ? err.name : "unknown", route: req.path }
    });
    return res.status(401).json({ error: "unauthenticated", message: "Invalid or expired credential." });
  }

  const role = claims.app_metadata?.role;
  if (!isKnownRole(role)) {
    baseLogger.warn({ userId: claims.sub, role }, "identity_unknown_role_claim");
    return res.status(401).json({ error: "unauthenticated", message: "Credential is missing a recognized role." });
  }

  req.identity = {
    userId: claims.sub,
    organizationId: claims.app_metadata?.organization_id ?? null,
    role,
    sessionId: claims.session_id ?? null,
    authTime: claims.iat,
    correlationId: req.correlationId
  };

  next();
}

/** For routes that must work whether or not the caller is authenticated (e.g. public health check). */
export function optionalIdentityMiddleware(req: Request, _res: Response, next: NextFunction) {
  const authHeader = req.header("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  if (!token) return next();

  try {
    const claims = verifyClaims(token);
    const role = claims.app_metadata?.role;
    if (isKnownRole(role)) {
      req.identity = {
        userId: claims.sub,
        organizationId: claims.app_metadata?.organization_id ?? null,
        role,
        sessionId: claims.session_id ?? null,
        authTime: claims.iat,
        correlationId: req.correlationId
      };
    }
  } catch {
    // Optional identity: an invalid token just means "treat as anonymous", not an error response.
  }
  next();
}
