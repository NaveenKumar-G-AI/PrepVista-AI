import { ReportLifecycleStatus as S } from "./enums";

/**
 * Explicit transition table for the report generation lifecycle (brief
 * §12). COMPLETED, FAILED, CANCELLED are terminal — nothing may transition
 * out of them. This is the single place that decides what's legal; every
 * status write in the codebase goes through assertValidTransition first
 * (see report-repository.ts), so an illegal transition throws instead of
 * silently corrupting a report's status.
 */
const ALLOWED_TRANSITIONS: Record<S, S[]> = {
  [S.REQUESTED]: [S.QUEUED, S.CANCELLED],
  [S.QUEUED]: [S.GENERATING, S.CANCELLED],
  [S.GENERATING]: [S.VALIDATING, S.FAILED],
  [S.VALIDATING]: [S.COMPLETED, S.FAILED],
  [S.COMPLETED]: [],
  [S.FAILED]: [],
  [S.CANCELLED]: [],
};

export class InvalidReportTransitionError extends Error {
  constructor(from: S, to: S) {
    super(`Illegal report lifecycle transition: ${from} -> ${to}`);
    this.name = "InvalidReportTransitionError";
  }
}

export function assertValidTransition(from: S, to: S): void {
  if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
    throw new InvalidReportTransitionError(from, to);
  }
}

export function isTerminal(status: S): boolean {
  return ALLOWED_TRANSITIONS[status].length === 0;
}
