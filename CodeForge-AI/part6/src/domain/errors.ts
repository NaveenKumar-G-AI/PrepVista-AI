export type ErrorCode =
  | 'NO_ACTIVE_TARGET'
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'CONFLICT';

export class AppError extends Error {
  code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'AppError';
    this.code = code;
  }
}

export function httpStatusForError(code: ErrorCode): number {
  switch (code) {
    case 'NO_ACTIVE_TARGET':
      return 409;
    case 'NOT_FOUND':
      return 404;
    case 'FORBIDDEN':
      return 403;
    case 'VALIDATION_ERROR':
      return 422;
    case 'CONFLICT':
      return 409;
    default:
      return 500;
  }
}
