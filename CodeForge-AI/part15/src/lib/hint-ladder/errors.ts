export class HintLadderError extends Error {
  constructor(message: string, public readonly code: string) {
    super(message);
    this.name = "HintLadderError";
  }
}

export class AuthError extends HintLadderError {
  constructor(message = "Not authenticated.") {
    super(message, "AUTH_ERROR");
    this.name = "AuthError";
  }
}

export class OwnershipError extends HintLadderError {
  constructor(message = "This session does not belong to the requesting user.") {
    super(message, "OWNERSHIP_ERROR");
    this.name = "OwnershipError";
  }
}

export class RateLimitError extends HintLadderError {
  constructor(public readonly retryAfterMs: number) {
    super("Too many hint requests — please slow down.", "RATE_LIMITED");
    this.name = "RateLimitError";
  }
}

export class ConcurrencyConflictError extends HintLadderError {
  constructor(message = "The hint session changed elsewhere — please retry.") {
    super(message, "CONCURRENCY_CONFLICT");
    this.name = "ConcurrencyConflictError";
  }
}

export class ValidationError extends HintLadderError {
  constructor(message: string) {
    super(message, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }
}

/** Maps a HintLadderError (or unknown error) to an HTTP status code for route handlers. */
export function httpStatusForError(err: unknown): number {
  if (err instanceof AuthError) return 401;
  if (err instanceof OwnershipError) return 403;
  if (err instanceof RateLimitError) return 429;
  if (err instanceof ConcurrencyConflictError) return 409;
  if (err instanceof ValidationError) return 400;
  return 500;
}
