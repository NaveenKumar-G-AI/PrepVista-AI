import { RETENTION_SCHEDULE_DAYS } from './config.js';

export interface RetentionScheduleEntry {
  scheduledFor: string; // ISO date
  step: number;
}

/**
 * PHASE 13: once a skill first qualifies as STRONG/MASTERED, schedule a
 * spaced-repetition-style sequence of retention checks rather than one
 * fixed date. A successful check should advance the caller to the next
 * (longer) step; a failed check should reset progression to step 0 and
 * drop the mastery state — that reset logic lives in the calling service
 * (MasteryService), not here, since it needs to write history too.
 */
export function nextRetentionCheck(fromDate: Date, currentStep: number): RetentionScheduleEntry {
  const step = Math.min(Math.max(currentStep, 0), RETENTION_SCHEDULE_DAYS.length - 1);
  const days = RETENTION_SCHEDULE_DAYS[step] ?? RETENTION_SCHEDULE_DAYS[RETENTION_SCHEDULE_DAYS.length - 1] ?? 30;
  const scheduledFor = new Date(fromDate.getTime() + days * 24 * 60 * 60 * 1000);
  return { scheduledFor: scheduledFor.toISOString(), step };
}
