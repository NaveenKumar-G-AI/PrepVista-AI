export class NotFoundError extends Error {
  status = 404;
  constructor(entity: string, id: string) {
    super(`${entity} ${id} not found`);
  }
}

export class ConflictError extends Error {
  status = 409;
  constructor(message: string) {
    super(message);
  }
}

export class InvalidTransitionError extends Error {
  status = 400;
  constructor(entity: string, from: string, to: string) {
    super(`Invalid ${entity} transition: ${from} -> ${to}`);
  }
}

export class ForbiddenError extends Error {
  status = 403;
  constructor(message = "Not authorized for this action") {
    super(message);
  }
}

export class ValidationError extends Error {
  status = 422;
  constructor(message: string) {
    super(message);
  }
}
