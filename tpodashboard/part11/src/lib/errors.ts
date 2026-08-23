export class AppError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const Errors = {
  unauthorized: (msg = 'Authentication required.') => new AppError(401, 'UNAUTHORIZED', msg),
  forbidden: (msg = 'You do not have permission to perform this action.') => new AppError(403, 'FORBIDDEN', msg),
  notFound: (msg = 'Resource not found.') => new AppError(404, 'NOT_FOUND', msg),
  badRequest: (msg: string) => new AppError(400, 'BAD_REQUEST', msg),
  conflict: (msg: string) => new AppError(409, 'CONFLICT', msg),
};
