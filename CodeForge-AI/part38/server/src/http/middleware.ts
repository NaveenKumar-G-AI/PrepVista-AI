import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { UserRole } from "../domain/enums";
import type { AuthenticatedUser } from "../ports";

/**
 * ############################################################################
 * PLACEHOLDER AUTH — replace with CodeForge's existing session/JWT/OAuth
 * middleware before shipping. This only exists so report-service
 * authorization logic (access-control.ts) — which IS real Feature 38 code —
 * can be exercised over real HTTP. It verifies a JWT signed with
 * AUTH_JWT_SECRET and trusts its payload as the user's identity/org/role;
 * a real integration would instead read an existing session or verify the
 * org's real IdP token.
 * ############################################################################
 */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

function jwtSecret(): string {
  const fromEnv = process.env.AUTH_JWT_SECRET;
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_JWT_SECRET must be set in production");
  }
  return "dev-insecure-secret-change-me";
}

export function signDemoToken(user: AuthenticatedUser): string {
  return jwt.sign(user, jwtSecret(), { expiresIn: "12h" });
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing bearer token." });
    return;
  }
  try {
    const payload = jwt.verify(header.slice("Bearer ".length), jwtSecret()) as AuthenticatedUser;
    if (!payload.id || !payload.orgId || !Object.values(UserRole).includes(payload.role)) {
      throw new Error("malformed token payload");
    }
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token." });
  }
}

/** Brief §73 — protects generation/export/bulk. Values are conservative demo defaults. */
export const generationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user?.id ?? req.ip ?? "anonymous",
});

export const exportRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user?.id ?? req.ip ?? "anonymous",
});

export const bulkRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => req.user?.id ?? req.ip ?? "anonymous",
});
