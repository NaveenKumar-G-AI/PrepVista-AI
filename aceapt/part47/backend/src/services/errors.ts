export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/** Thrown when a guidance-granting action is requested on a VERIFICATION-mode session (Section 77). */
export class GuidanceUnavailableError extends Error {
  constructor(message = "Independent verification has no guidance available - that's the point! Give it your best shot.") {
    super(message);
    this.name = 'GuidanceUnavailableError';
  }
}

export class InvalidRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRequestError';
  }
}
