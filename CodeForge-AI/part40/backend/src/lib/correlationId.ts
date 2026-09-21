import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";

/**
 * CORRELATION IDS
 * -----------------------------------------------------------------------
 * A major operation should be traceable across frontend -> API -> service
 * -> database -> queue -> worker -> AI. This middleware is the API entry
 * point of that chain: it accepts an inbound `x-correlation-id` (so a
 * frontend request ID or an upstream service's ID survives the hop), or
 * mints a new one, attaches it to `req`, echoes it back on the response,
 * and it is threaded into every audit_event / security_event this request
 * produces and into every log line via lib/logger.ts.
 */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      correlationId: string;
      startedAtMs: number;
    }
  }
}

const HEADER = "x-correlation-id";

export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const inbound = req.header(HEADER);
  const id = inbound && /^[A-Za-z0-9_-]{8,128}$/.test(inbound) ? inbound : crypto.randomUUID();
  req.correlationId = id;
  req.startedAtMs = Date.now();
  res.setHeader(HEADER, id);
  next();
}
