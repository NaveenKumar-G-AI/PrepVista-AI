import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { isProduction } from "../config/env";
import { loggerForRequest } from "../lib/logger";
import { CircuitOpenError } from "../lib/circuitBreaker";
import { TimeoutError } from "../lib/retry";

/**
 * ERROR TRACKING + ERROR GROUPING + OUTPUT SECURITY
 * -----------------------------------------------------------------------
 * - Never swallows an error silently: every error reaches here and is
 *   logged with full internal detail (server-side only).
 * - Never leaks internal detail to the client: production responses are a
 *   generic message + an error_id the person can quote to support, never
 *   a stack trace, SQL fragment, or file path.
 * - Groups repeated identical errors into one fingerprint (error class +
 *   normalized message, digits stripped) so "10000 identical failures"
 *   reads as one issue with an occurrence count in logs/observability
 *   tooling, not 10000 unrelated-looking log lines. This is a lightweight
 *   fingerprint suitable for log-based grouping; a dedicated error
 *   tracker (Sentry etc.) would do this more richly if/when CodeForge
 *   adopts one — this keeps the behavior meaningful without it.
 */

function fingerprint(err: Error): string {
  const normalizedMessage = err.message.replace(/[0-9a-fA-F-]{8,}/g, "<id>").replace(/\d+/g, "<n>");
  return crypto.createHash("sha1").update(`${err.name}:${normalizedMessage}`).digest("hex").slice(0, 12);
}

function statusForError(err: Error): number {
  if (err instanceof CircuitOpenError) return 503;
  if (err instanceof TimeoutError) return 504;
  const anyErr = err as { statusCode?: number; status?: number };
  if (typeof anyErr.statusCode === "number") return anyErr.statusCode;
  if (typeof anyErr.status === "number") return anyErr.status;
  return 500;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction) {
  const errorId = crypto.randomUUID();
  const fp = fingerprint(err);
  const status = statusForError(err);
  const log = loggerForRequest(req.correlationId ?? "unknown", req.identity?.organizationId ?? null);

  log[status >= 500 ? "error" : "warn"](
    {
      error_id: errorId,
      fingerprint: fp,
      err,
      route: req.path,
      method: req.method,
      status,
      duration_ms: req.startedAtMs ? Date.now() - req.startedAtMs : undefined
    },
    "request_error"
  );

  const body: Record<string, unknown> = {
    error: status === 503 ? "service_unavailable" : status === 504 ? "timeout" : status < 500 ? "bad_request" : "internal_error",
    error_id: errorId
  };
  if (!isProduction) {
    // Non-production only: helps local/staging debugging without ever
    // shipping this detail to a real end user in production.
    body.debug_message = err.message;
  }

  res.status(status).json(body);
}

/** Catches promise rejections from async route handlers without needing every route wrapped manually. */
export function asyncRoute<Req extends Request, Res extends Response>(
  fn: (req: Req, res: Res, next: NextFunction) => Promise<unknown>
) {
  return (req: Req, res: Res, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
