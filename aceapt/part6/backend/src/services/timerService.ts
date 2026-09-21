import { Assessment } from '../domain/types';

/**
 * Every function here is a pure calculation from server timestamps. Nothing
 * in the codebase should compute "time remaining" or "time spent" from a
 * client-submitted number - section 16: "Do not trust client-submitted
 * timing data for critical scoring." The client is only ever a *display* of
 * what these functions return.
 */

export function computeEndsAt(startedAtIso: string, durationSeconds: number): string {
  const startedMs = Date.parse(startedAtIso);
  return new Date(startedMs + durationSeconds * 1000).toISOString();
}

export function remainingSeconds(assessment: Pick<Assessment, 'endsAt' | 'status'>): number {
  if (!assessment.endsAt) return 0;
  if (assessment.status === 'SUBMITTED' || assessment.status === 'COMPLETED' || assessment.status === 'EXPIRED') {
    return 0;
  }
  const endsMs = Date.parse(assessment.endsAt);
  const remainingMs = endsMs - Date.now();
  return Math.max(0, Math.round(remainingMs / 1000));
}

export function isExpired(assessment: Pick<Assessment, 'endsAt' | 'status'>): boolean {
  if (assessment.status !== 'IN_PROGRESS') return false;
  if (!assessment.endsAt) return false;
  return Date.now() > Date.parse(assessment.endsAt);
}

export function elapsedSeconds(startedAtIso: string | null): number {
  if (!startedAtIso) return 0;
  return Math.max(0, Math.round((Date.now() - Date.parse(startedAtIso)) / 1000));
}
