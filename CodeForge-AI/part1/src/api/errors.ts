export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus: number,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class UnauthenticatedError extends DomainError {
  constructor() {
    super('UNAUTHENTICATED', 'A valid student identity is required.', 401);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'You are not allowed to perform this action.') {
    super('FORBIDDEN', message, 403);
  }
}

export class RoleNotFoundError extends DomainError {
  constructor(slug: string) {
    super('ROLE_NOT_FOUND', `No role definition exists for "${slug}".`, 404);
  }
}

export class RoleNotSelectableError extends DomainError {
  constructor(slug: string) {
    super('ROLE_NOT_SELECTABLE', `"${slug}" is not currently selectable (it is deprecated or archived).`, 409);
  }
}

export class InvalidCareerContextError extends DomainError {
  constructor(message: string) {
    super('INVALID_CAREER_CONTEXT', message, 400);
  }
}

// Deliberately reused for both "unknown institution" and "wrong tenant" so
// a cross-tenant request cannot distinguish "doesn't exist" from "exists
// but isn't yours" (Step 57: must not leak cross-tenant existence).
export class ResourceNotFoundError extends DomainError {
  constructor(message = 'The requested resource was not found.') {
    super('RESOURCE_NOT_FOUND', message, 404);
  }
}
