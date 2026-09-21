import type { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { ZodError } from "zod";

export interface AuthedRequest extends Request {
  studentId?: string;
}

/**
 * INTEGRATION POINT — not production auth.
 *
 * There is no existing ACEAPT auth system in this standalone build to
 * verify a session against, so this trusts an `x-student-id` header.
 * That is intentionally isolated here and nowhere else, per spec
 * section 34 ("do not disguise a mock as production functionality"):
 * every route downstream only ever sees `req.studentId`, so replacing
 * this function with a real session/JWT verification call against
 * ACEAPT's auth service is the only change required to go live.
 */
export function authStub(req: AuthedRequest, res: Response, next: NextFunction): void {
  const studentId = req.header("x-student-id");
  if (!studentId || !studentId.trim()) {
    res.status(401).json({
      error: {
        code: "UNAUTHORIZED",
        message: "Missing student session. (Dev stub: send an 'x-student-id' header.)",
      },
    });
    return;
  }
  req.studentId = studentId.trim();
  next();
}

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startedAt = Date.now();
  res.on("finish", () => {
    const durationMs = Date.now() - startedAt;
    console.log(
      JSON.stringify({
        level: "info",
        msg: "request",
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        durationMs,
        studentId: (req as AuthedRequest).studentId ?? null,
      }),
    );
  });
  next();
}

export function buildRateLimiter(env: NodeJS.ProcessEnv) {
  return rateLimit({
    windowMs: Number(env.RATE_LIMIT_WINDOW_MS ?? 60_000),
    max: Number(env.RATE_LIMIT_MAX ?? 60),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => (req as AuthedRequest).studentId ?? req.ip ?? "anonymous",
    message: { error: { code: "RATE_LIMITED", message: "Too many requests. Please slow down and try again shortly." } },
  });
}

export class NotFoundError extends Error {}
export class ValidationError extends Error {}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Some of the information provided wasn't valid.",
        details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
    });
    return;
  }
  if (err instanceof ValidationError) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: err.message } });
    return;
  }
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: err.message } });
    return;
  }
  // Never leak internals to the client (spec section 29) — log full
  // detail server-side, return a calm, generic message to the student.
  console.error("[unhandled_error]", err);
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "We couldn't complete that right now. Please try again." },
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "That endpoint doesn't exist." } });
}
