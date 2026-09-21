export class ForbiddenError extends Error {
  constructor(message = 'Not authorized to access this resource.') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends Error {
  constructor(message = 'Resource not found.') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  constructor(message = 'Invalid request.') {
    super(message);
    this.name = 'ValidationError';
  }
}
