import type { SeriesPoint } from "../domain/types.js";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Whole days between two dates (b - a). Can be negative. */
export function daysBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / MS_PER_DAY;
}

export function nowIso(now: Date = new Date()): string {
  return now.toISOString();
}

/** Day offsets (0 = first point's date) for a chronologically-sorted series.
 * Used so trend slopes reflect real elapsed time rather than assuming evenly
 * spaced observations — evidence in production won't arrive on a schedule. */
export function dayOffsets(points: SeriesPoint[]): number[] {
  if (points.length === 0) return [];
  const base = new Date(points[0]!.date).getTime();
  return points.map((p) => (new Date(p.date).getTime() - base) / MS_PER_DAY);
}

/** Rough cadence of observations, used only for the optional "estimated
 * sessions to close the gap" figure (section 21) — never invented, only
 * computed when there's a real span of dates to divide by. */
export function estimateObservationsPerWeek(points: { date: string }[]): number | null {
  if (points.length < 2) return null;
  const sorted = [...points].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const spanDays = daysBetween(new Date(sorted[0]!.date), new Date(sorted[sorted.length - 1]!.date));
  if (spanDays <= 0) return null;
  return (points.length / spanDays) * 7;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}
