import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { NoQuestionAvailableError } from "../services/questionVariationService.js";
import { VerificationSessionUnavailableError, InvalidAttemptStateError } from "../services/masteryVerificationService.js";

/** Central error mapper. Keeps route handlers free of repetitive try/catch
 *  status-code logic while making sure known domain errors (spec section 53:
 *  "handle... never silently create false mastery evidence") return a clean,
 *  specific message instead of a raw 500 stack trace leaking to the client. */
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({ error: "Invalid request.", details: err.flatten() });
    return;
  }
  if (err instanceof VerificationSessionUnavailableError) {
    res.status(503).json({ error: err.message });
    return;
  }
  if (err instanceof NoQuestionAvailableError) {
    res.status(503).json({ error: err.message });
    return;
  }
  if (err instanceof InvalidAttemptStateError) {
    res.status(409).json({ error: err.message });
    return;
  }

  // eslint-disable-next-line no-console
  console.error("[unhandled error]", err);
  res.status(500).json({ error: "Internal server error." });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: `No route: ${req.method} ${req.path}` });
}
