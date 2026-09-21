import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AuthenticationError, AuthorizationError } from '../lib/auth';
import { logger } from '../lib/logger';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
  details?: unknown;
}

export class NotFoundError extends Error {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  constructor(message: string, public details?: unknown) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class RateLimitError extends Error {
  constructor(message: string = 'Too many requests') {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class AIServiceError extends Error {
  constructor(message: string, public retryable: boolean = false) {
    super(message);
    this.name = 'AIServiceError';
  }
}

export function errorHandler(err: ApiError, _req: Request, res: Response, _next: NextFunction) {
  // Log the error
  logger.error({
    err,
    message: err.message,
    stack: err.stack,
    code: err.code,
    statusCode: err.statusCode,
  }, 'Request error');

  // Handle specific error types
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: err.flatten().fieldErrors,
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({
        error: 'Resource already exists',
        code: 'DUPLICATE_ENTRY',
        details: err.meta?.target,
      });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({
        error: 'Resource not found',
        code: 'NOT_FOUND',
      });
    }
  }

  if (err instanceof AuthenticationError) {
    return res.status(401).json({
      error: err.message || 'Authentication required',
      code: 'UNAUTHORIZED',
    });
  }

  if (err instanceof AuthorizationError) {
    return res.status(403).json({
      error: err.message || 'Access denied',
      code: 'FORBIDDEN',
    });
  }

  if (err instanceof NotFoundError) {
    return res.status(404).json({
      error: err.message,
      code: 'NOT_FOUND',
    });
  }

  if (err instanceof ValidationError) {
    return res.status(400).json({
      error: err.message,
      code: 'VALIDATION_ERROR',
      details: err.details,
    });
  }

  if (err instanceof ConflictError) {
    return res.status(409).json({
      error: err.message,
      code: 'CONFLICT',
    });
  }

  if (err instanceof RateLimitError) {
    return res.status(429).json({
      error: err.message,
      code: 'RATE_LIMITED',
    });
  }

  if (err instanceof AIServiceError) {
    return res.status(err.retryable ? 503 : 500).json({
      error: err.message,
      code: 'AI_SERVICE_ERROR',
      retryable: err.retryable,
    });
  }

  // Default: internal server error
  const statusCode = err.statusCode || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;

  return res.status(statusCode).json({
    error: message,
    code: err.code || 'INTERNAL_ERROR',
  });
}

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({
    error: 'Endpoint not found',
    code: 'NOT_FOUND',
  });
}