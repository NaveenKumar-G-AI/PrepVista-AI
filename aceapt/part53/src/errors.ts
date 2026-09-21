export class AppError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  constructor(message: string, code: string, httpStatus: number) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 'NOT_FOUND', 404);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string) {
    super(message, 'FORBIDDEN', 403);
  }
}

export class IllegalTransitionError extends AppError {
  constructor(message: string) {
    super(message, 'ILLEGAL_TRANSITION', 409);
  }
}

export class ConcurrencyConflictError extends AppError {
  constructor(message: string) {
    super(message, 'CONCURRENCY_CONFLICT', 409);
  }
}

/** Thrown when a reviewer tries to approve a version with unresolved CRITICAL issues and no
 *  overrideReason (section 11 — a question "MUST NOT be published" while a hard gate fails). */
export class ValidationBlockedError extends AppError {
  constructor(message: string) {
    super(message, 'VALIDATION_BLOCKED', 422);
  }
}
