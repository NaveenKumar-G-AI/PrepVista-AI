import { ErrorRequestHandler } from 'express';
import { AppError } from '../lib/errors';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }
  if (err && typeof err === 'object' && 'issues' in err) {
    // zod validation error
    res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid request.', details: (err as any).issues } });
    return;
  }
  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong.' } });
};
