import { BehaviorEvent } from '../types/events';

/**
 * Temporal helpers (section 23: Temporal Analysis).
 * Every window-based calculation in the signal engine goes through these
 * functions so day-boundary and timezone logic lives in exactly one place
 * (section 43: handle timezone differences without duplicating tz math).
 */

/** Local calendar day as YYYY-MM-DD, using the event's own timezone offset (minutes east of UTC). */
export function localDateKey(event: Pick<BehaviorEvent, 'occurredAtUtc' | 'timezoneOffsetMinutes'>): string {
  const utcMs = new Date(event.occurredAtUtc).getTime();
  const localMs = utcMs + event.timezoneOffsetMinutes * 60_000;
  return new Date(localMs).toISOString().slice(0, 10);
}

/** Whole days between two YYYY-MM-DD date keys (order-independent). */
export function daysBetweenDateKeys(a: string, b: string): number {
  const aMs = new Date(a + 'T00:00:00Z').getTime();
  const bMs = new Date(b + 'T00:00:00Z').getTime();
  return Math.round(Math.abs(bMs - aMs) / 86_400_000);
}

/**
 * Filters events to those within `windowDays` of `now` (inclusive), based
 * on occurredAtUtc. Bounded on BOTH sides: excludes events older than the
 * window AND events after `now`. The upper bound matters whenever a
 * profile is computed "as of" a past cutoff (e.g. a historical snapshot,
 * or the demo script's before/after comparison) - without it, events that
 * hadn't happened yet at that cutoff would leak into the window.
 */
export function withinWindow<T extends { occurredAtUtc: string }>(events: T[], now: Date, windowDays: number): T[] {
  const cutoff = now.getTime() - windowDays * 86_400_000;
  const upperBound = now.getTime();
  return events.filter((e) => {
    const t = new Date(e.occurredAtUtc).getTime();
    return t >= cutoff && t <= upperBound;
  });
}

/** Days elapsed between an ISO timestamp and `now` (>= 0, floored). */
export function daysSince(iso: string, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000));
}

/** Sorted, de-duplicated list of local calendar-day keys present in a set of events. */
export function activeDateKeys<T extends { occurredAtUtc: string; timezoneOffsetMinutes: number }>(events: T[]): string[] {
  return Array.from(new Set(events.map((e) => localDateKey(e)))).sort();
}
