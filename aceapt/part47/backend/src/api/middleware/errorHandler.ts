import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { ForbiddenError, GuidanceUnavailableError, InvalidRequestError, NotFoundError } from '../../services/errors.js';
import { OptimisticLockError } from '../../repositories/guidedSessionRepository.js';
import { InvalidTransitionError } from '../../domain/engine/stateMachine.js';

/**
 * One place that decides HTTP status codes for domain errors (Section 92:
 * "Frontend error states" needs a stable, typed error shape to react to).
 * Every controller can `next(err)` and rely on this running last.
 */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Request payload failed validation.', issues: err.issues });
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
  if (err instanceof GuidanceUnavailableError) {
    res.status(409).json({ error: 'GUIDANCE_UNAVAILABLE', message: err.message });
    return;
  }
  if (err instanceof OptimisticLockError) {
    res.status(409).json({
      error: 'VERSION_CONFLICT',
      message: err.message,
      expectedVersion: err.expectedVersion,
      actualVersion: err.actualVersion,
    });
    return;
  }
  if (err instanceof InvalidTransitionError || err instanceof InvalidRequestError) {
    res.status(409).json({ error: 'INVALID_STATE_TRANSITION', message: err.message });
    return;
  }

  // Unknown/unexpected error: never leak internals (Section 94), always log server-side.
  console.error('[unhandled-error]', err);
  res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' });
}

/** Wraps an async Express handler so a rejected promise reaches errorHandler instead of crashing the process. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
