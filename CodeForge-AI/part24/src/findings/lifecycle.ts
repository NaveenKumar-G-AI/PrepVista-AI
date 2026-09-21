import type { FindingStatus } from '../domain/types';

/**
 * Finding status transitions are server-controlled and auditable: a status
 * can only move along edges defined here. Anything else throws, so illegal
 * client-driven state changes (e.g. a student's request body claiming a
 * finding is RESOLVED) can never silently succeed.
 */
const ALLOWED_TRANSITIONS: Record<FindingStatus, FindingStatus[]> = {
  OPEN: ['ACKNOWLEDGED', 'IN_PROGRESS', 'FIXED', 'RESOLVED', 'WONT_FIX', 'SUPERSEDED'],
  ACKNOWLEDGED: ['IN_PROGRESS', 'FIXED', 'RESOLVED', 'WONT_FIX', 'SUPERSEDED'],
  IN_PROGRESS: ['FIXED', 'RESOLVED', 'WONT_FIX', 'SUPERSEDED', 'ACKNOWLEDGED'],
  FIXED: ['RESOLVED', 'REOPENED'],
  RESOLVED: ['REOPENED'],
  REOPENED: ['ACKNOWLEDGED', 'IN_PROGRESS', 'FIXED', 'WONT_FIX', 'RESOLVED'],
  WONT_FIX: ['REOPENED'],
  SUPERSEDED: [],
};

export function transition(current: FindingStatus, next: FindingStatus): FindingStatus {
  if (current === next) return current;
  const allowed = ALLOWED_TRANSITIONS[current];
  if (!allowed.includes(next)) {
    throw new Error(`Illegal finding transition: ${current} -> ${next}`);
  }
  return next;
}

export function isTerminal(status: FindingStatus): boolean {
  return status === 'SUPERSEDED';
}
