export class HttpError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = 'HttpError';
  }
}

export const Errors = {
  blueprintNotFound: (id: string) =>
    new HttpError(404, 'BLUEPRINT_NOT_FOUND', `No simulation blueprint found for id "${id}".`),
  simulationNotFound: (id: string) =>
    new HttpError(404, 'SIMULATION_NOT_FOUND', `No simulation found for id "${id}".`),
  questionNotFound: (id: string) =>
    new HttpError(404, 'QUESTION_NOT_FOUND', `No question found for id "${id}".`),
  notOwner: () =>
    new HttpError(403, 'FORBIDDEN', 'This simulation does not belong to the authenticated student.'),
  notInProgress: () =>
    new HttpError(409, 'SIMULATION_NOT_IN_PROGRESS', 'This simulation is not currently in progress.'),
  questionNotInSimulation: (id: string) =>
    new HttpError(400, 'QUESTION_NOT_IN_SIMULATION', `Question "${id}" is not part of this simulation.`),
  alreadyAnswered: () =>
    new HttpError(409, 'ALREADY_ANSWERED', 'This question already has an answer. Submit a new answer to change it.'),
  notSkipped: () =>
    new HttpError(409, 'NOT_SKIPPED', 'This question was not skipped, so there is nothing to return to.'),
  skipNotAllowed: () =>
    new HttpError(403, 'SKIP_NOT_ALLOWED', 'This blueprint does not permit skipping questions.'),
  returnNotAllowed: () =>
    new HttpError(403, 'RETURN_NOT_ALLOWED', 'This blueprint does not permit returning to skipped questions.'),
  unauthenticated: () =>
    new HttpError(401, 'UNAUTHENTICATED', 'Missing or invalid authentication token.'),
  validation: (message: string) => new HttpError(400, 'VALIDATION_ERROR', message),
};
