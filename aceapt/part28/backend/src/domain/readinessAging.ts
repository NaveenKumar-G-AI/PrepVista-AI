// Section 37 — readiness aging: verification is not necessarily permanent.
// A small, explicit policy function rather than a background job, so the
// same logic runs identically whether called from the API or a future
// scheduler.

import type { AgingState } from './types.js';

export function computeAgingState(
  verifiedAt: string | null,
  now: Date,
  stalenessDays: number,
  recheckDays: number,
): AgingState {
  if (!verifiedAt) return 'RECHECK_RECOMMENDED';
  const ageDays = (now.getTime() - new Date(verifiedAt).getTime()) / (1000 * 60 * 60 * 24);
  if (ageDays >= recheckDays) return 'RECHECK_RECOMMENDED';
  if (ageDays >= stalenessDays) return 'AGING';
  return 'VERIFIED';
}
