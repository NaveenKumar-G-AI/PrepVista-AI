import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { logError } from '../utils/logger';
import { ForbiddenError, InvalidStateError, NotFoundError } from '../services/sessionService';
import { InsufficientEvidenceError } from '../services/assessmentGenerationService';

/** Maps known domain errors to sensible HTTP status codes; never leaks stack traces to the client. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'INVALID_REQUEST', message: 'Request body failed validation.', issues: err.issues });
    return;
  }
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: 'NOT_FOUND', message: err.message });
    return;
  }
  if (err instanceof ForbiddenError) {
    res.status(403).json({ error: 'FORBIDDEN', message: err.message });
    return;
  }
  if (err instanceof InvalidStateError) {
    res.status(409).json({ error: 'INVALID_STATE', message: err.message });
    return;
  }
  if (err instanceof InsufficientEvidenceError) {
    res.status(422).json({ error: 'INSUFFICIENT_EVIDENCE', message: err.message });
    return;
  }
  logError('Unhandled error:', err);
  res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Something went wrong processing that request.' });
}

/** Wraps an async route handler so rejected promises reach errorHandler instead of hanging the request. */
export function asyncRoute<T extends (req: Request, res: Response) => Promise<void>>(fn: T) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };
}
