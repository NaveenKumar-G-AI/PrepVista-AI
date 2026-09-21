import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../../utils/logger';

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Wraps an async Express handler so rejected promises reach the error middleware instead of hanging the request. */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.code, message: err.message });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Request did not match the expected shape.', issues: err.issues });
  }
  logger.error('unhandled_api_error', { message: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined });
  res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Something went wrong.' });
}
