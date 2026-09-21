import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "aceapt_token";
const TOKEN_TTL = "30d";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.trim().length > 0) return secret;
  // Dev-only fallback so the app runs immediately with a blank .env.
  // Every real deployment must set JWT_SECRET explicitly.
  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[aceapt] JWT_SECRET is not set. Using an insecure development default — set JWT_SECRET before deploying."
    );
  }
  return "dev-insecure-secret-change-me-before-deploying";
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export function signToken(userId: string): string {
  return jwt.sign({ sub: userId }, getJwtSecret(), { expiresIn: TOKEN_TTL });
}

export function verifyToken(token: string): string | null {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as jwt.JwtPayload;
    return typeof decoded.sub === "string" ? decoded.sub : null;
  } catch {
    return null;
  }
}

/** Server-side identity extraction. The frontend never supplies a
 *  user id directly to any API route — every route derives it from
 *  the signed session cookie, here. */
export function getUserIdFromRequest(request: NextRequest): string | null {
  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export function setAuthCookie(response: NextResponse, userId: string): void {
  const token = signToken(userId);
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearAuthCookie(response: NextResponse): void {
  response.cookies.set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
}

export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

/** Every protected API route calls this first. Throws if there is no
 *  valid session — routes catch this centrally (see lib/apiHandler.ts). */
export function requireUserId(request: NextRequest): string {
  const userId = getUserIdFromRequest(request);
  if (!userId) throw new UnauthorizedError();
  return userId;
}
