import { NextFunction, Request, Response } from "express";

export class PositioningError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/**
 * Spec section 71, "AI Failure": never display fabricated analysis when
 * something goes wrong. Known errors return their real message; anything
 * unexpected returns a generic, honest, retryable message instead of
 * guessing at a cause.
 */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof PositioningError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }

  console.error("[positioning] Unexpected error:", err);
  res.status(503).json({
    error: "Positioning analysis is temporarily unavailable.",
    code: "POSITIONING_UNAVAILABLE",
    retryable: true,
  });
}
