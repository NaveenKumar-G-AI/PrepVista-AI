import { FreshnessState } from '../types/domain';

const MS_PER_DAY = 86_400_000;

/**
 * Evidence freshness is capability-specific, not universal — a coding
 * assessment from 8 months ago decays differently than a system-design
 * interview from 8 months ago. Callers pass in the freshness window that
 * applies to the specific capability (see `DEFAULT_FRESHNESS_WINDOWS_DAYS`
 * below for sensible starting points; a real deployment should let this be
 * configured per capability).
 *
 *   0                → window/2         RECENT
 *   window/2         → window           AGING
 *   window           → window*2         STALE
 *   window*2         → ∞                REVALIDATION_RECOMMENDED
 */
export function computeFreshness(occurredAtIso: string, windowDays: number, now: Date = new Date()): FreshnessState {
  const days = (now.getTime() - new Date(occurredAtIso).getTime()) / MS_PER_DAY;

  if (days <= windowDays * 0.5) return 'RECENT';
  if (days <= windowDays) return 'AGING';
  if (days <= windowDays * 2) return 'STALE';
  return 'REVALIDATION_RECOMMENDED';
}

/**
 * Sensible defaults, in days, for how long evidence stays meaningful.
 * Practical/tooling-heavy capabilities decay faster than durable
 * fundamentals. These are starting points, meant to be overridden per
 * capability once real usage data exists (see Capability.freshnessWindowDays
 * in the Prisma schema).
 */
export const DEFAULT_FRESHNESS_WINDOW_DAYS = 210;

export const FRESHNESS_WINDOW_PRESETS_DAYS = {
  FUNDAMENTAL: 365, // e.g. core language / CS fundamentals
  APPLIED: 210, // e.g. frameworks, SQL, REST APIs
  TOOLING: 120, // e.g. a specific fast-moving tool or library version
} as const;
