export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Not found.') {
    super(404, message);
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'You do not have access to this resource.') {
    super(403, message);
    this.name = 'ForbiddenError';
  }
}

export class ValidationError extends ApiError {
  constructor(message = 'The request was invalid.') {
    super(400, message);
    this.name = 'ValidationError';
  }
}

// Converts any thrown error into a consistent JSON error shape. Never leaks
// stack traces or internal messages for unexpected errors (Section 41).
export function apiErrorBody(error: unknown): { status: number; body: { error: string } } {
  if (error instanceof ApiError) {
    return { status: error.status, body: { error: error.message } };
  }
  console.error(error);
  return { status: 500, body: { error: 'Something went wrong. Please try again.' } };
}
