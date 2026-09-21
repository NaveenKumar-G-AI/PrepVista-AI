export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(message: string, statusCode: number, code: string, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found.', details?: unknown) {
    super(message, 404, 'NOT_FOUND', details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action.', details?: unknown) {
    super(message, 403, 'FORBIDDEN', details);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Invalid request.', details?: unknown) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflicting request.', details?: unknown) {
    super(message, 409, 'CONFLICT', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required.', details?: unknown) {
    super(message, 401, 'UNAUTHORIZED', details);
  }
}
