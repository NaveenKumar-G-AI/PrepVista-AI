// ============================================================================
// Every orchestration use case throws one of a small set of typed errors
// (see src/orchestration/helpers.ts) plus AIGatewayError for provider
// failures. This is the single place that maps them to HTTP status codes —
// route handlers never construct an HTTP response for an error case
// themselves, which is what keeps error handling consistent across every
// endpoint (Phase 65: the API surface, including its errors, is derived
// centrally, not decided ad hoc per route).
// ============================================================================

import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AuthorizationError, ConflictError, NotFoundError } from "../../orchestration/helpers.js";
import { AIGatewayError } from "../../integration/ports.js";

export function errorHandler() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
    if (err instanceof ZodError) {
      res.status(400).json({ error: "INVALID_REQUEST", message: "Request validation failed.", issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })) });
      return;
    }
    if (err instanceof AuthorizationError) {
      res.status(403).json({ error: "FORBIDDEN", message: err.message });
      return;
    }
    if (err instanceof NotFoundError) {
      res.status(404).json({ error: "NOT_FOUND", message: err.message });
      return;
    }
    if (err instanceof ConflictError) {
      res.status(409).json({ error: "CONFLICT", message: err.message });
      return;
    }
    if (err instanceof AIGatewayError) {
      const status = err.cause === "NOT_CONFIGURED" ? 503 : err.cause === "TIMEOUT" ? 504 : 502;
      res.status(status).json({ error: `AI_GATEWAY_${err.cause}`, message: "The AI provider is temporarily unavailable. This is never treated as a student failure — retry shortly." });
      return;
    }

    // eslint-disable-next-line no-console
    console.error("Unhandled error in technical-interview API:", err);
    res.status(500).json({ error: "INTERNAL_ERROR", message: "An unexpected error occurred." });
  };
}
