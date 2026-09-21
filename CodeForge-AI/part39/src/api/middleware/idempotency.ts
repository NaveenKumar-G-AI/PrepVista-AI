import { NextFunction, Request, Response } from 'express';

interface StoredResponse {
  status: number;
  body: unknown;
  expiresAt: number;
}

const store = new Map<string, StoredResponse>();
const TTL_MS = 10 * 60_000;

/**
 * Generic idempotency for mutation endpoints (policy/budget writes,
 * emergency controls) using an `Idempotency-Key` header, so a retried
 * request (client timeout + retry, double-tap, etc.) doesn't create
 * duplicate expensive work or apply the same mutation twice. The
 * AIGateway's own execute() has a dedicated, request-shaped idempotency
 * path — this covers everything else.
 */
export function idempotency(req: Request, res: Response, next: NextFunction): void {
  const key = req.header('idempotency-key');
  if (!key || !req.auth) {
    next();
    return;
  }

  const storeKey = `${req.auth.organizationId}:${key}`;
  const existing = store.get(storeKey);
  if (existing && existing.expiresAt > Date.now()) {
    res.status(existing.status).json(existing.body);
    return;
  }

  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    store.set(storeKey, { status: res.statusCode, body, expiresAt: Date.now() + TTL_MS });
    return originalJson(body);
  };

  next();
}
