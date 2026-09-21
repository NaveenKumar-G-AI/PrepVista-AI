import { Request, Response, NextFunction } from 'express';

/**
 * Spec ??88 AI FAILURE / general failure handling: never invent a 200 with
 * fabricated data. Anything that reaches here returns a clear error shape;
 * routes are responsible for returning proper empty-state payloads (spec
 * ??86-87) for the "no data yet" cases, which are NOT errors.
 */
export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  // eslint-disable-next-line no-console
  console.error('[errorHandler]', err);
  const status = err.status || 500;
  res.status(status).json({
    error: status === 500 ? 'Internal error. Please retry.' : err.message || 'Request failed.',
  });
}

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: 'Not found' });
}
