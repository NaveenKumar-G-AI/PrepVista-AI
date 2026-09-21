import type { NextFunction, Request, Response } from 'express';
import { DomainError } from '../../domain/types';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof DomainError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  const message = err instanceof Error ? err.message : 'Unknown error';
  logger.error('unhandled_error', { message, path: req.path });
  res.status(500).json({ error: env.NODE_ENV === 'production' ? 'Something went wrong.' : message });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: `No route for ${req.method} ${req.path}` });
}
