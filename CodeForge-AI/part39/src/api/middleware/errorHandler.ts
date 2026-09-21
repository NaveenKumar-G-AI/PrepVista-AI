import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AIGatewayError, redact } from '../../errors';
import { PolicyValidationError } from '../../policy/PolicyValidator';
import { DASHBOARD_ROLES } from '../../types';

/**
 * The single place an uncaught error becomes an HTTP response. Public
 * messages are always safe to show; internal diagnostic detail is logged
 * server-side (redacted) and only echoed back to callers with an admin
 * role — see spec: "Never expose raw provider errors" /
 * "Engineering/admin interfaces may expose additional diagnostics
 * according to permissions."
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction): void {
  const isAdmin = req.auth ? DASHBOARD_ROLES.has(req.auth.role) : false;

  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Invalid request', issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
    return;
  }

  if (err instanceof PolicyValidationError) {
    res.status(422).json({ error: 'Invalid policy configuration', issues: err.issues });
    return;
  }

  if (err instanceof AIGatewayError) {
    // eslint-disable-next-line no-console
    console.error(`[${err.category}]`, redact({ message: err.message, internalDetail: err.internalDetail }));
    const statusMap: Record<string, number> = {
      BUDGET_LIMIT: 402,
      QUOTA_LIMIT: 429,
      RATE_LIMIT: 429,
      POLICY_REJECTION: 422,
      AUTHENTICATION: 502,
      INVALID_REQUEST: 400,
      CONTENT_VALIDATION: 502,
      TIMEOUT: 504,
      CIRCUIT_OPEN: 503,
    };
    res.status(statusMap[err.category] ?? 502).json({
      error: err.message,
      category: err.category,
      ...(isAdmin && err.internalDetail ? { detail: err.internalDetail } : {}),
    });
    return;
  }

  const withStatus = err as { statusCode?: number; message?: string };
  if (withStatus.statusCode) {
    res.status(withStatus.statusCode).json({ error: withStatus.message ?? 'Request could not be completed' });
    return;
  }

  // eslint-disable-next-line no-console
  console.error('[UNHANDLED]', redact(err));
  res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
}
