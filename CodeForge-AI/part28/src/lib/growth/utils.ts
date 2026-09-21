import type { TimeWindow, TimeWindowPreset, GrowthEvidence } from "./types.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

export function daysAgo(iso: string, now: Date = new Date()): number {
  return (now.getTime() - new Date(iso).getTime()) / DAY_MS;
}

export function resolveTimeWindow(preset: TimeWindowPreset, now: Date = new Date()): TimeWindow {
  const end = now.toISOString();
  switch (preset) {
    case "RECENT_7D":
      return { preset, startsAt: new Date(now.getTime() - 7 * DAY_MS).toISOString(), endsAt: end };
    case "RECENT_30D":
      return { preset, startsAt: new Date(now.getTime() - 30 * DAY_MS).toISOString(), endsAt: end };
    case "RECENT_90D":
      return { preset, startsAt: new Date(now.getTime() - 90 * DAY_MS).toISOString(), endsAt: end };
    case "SEMESTER":
      return { preset, startsAt: new Date(now.getTime() - 120 * DAY_MS).toISOString(), endsAt: end };
    case "ACADEMIC_YEAR":
      return { preset, startsAt: new Date(now.getTime() - 300 * DAY_MS).toISOString(), endsAt: end };
    case "ALL_TIME":
      return { preset, startsAt: null, endsAt: end };
  }
}

export function withinWindow(occurredAt: string, window: TimeWindow): boolean {
  const t = new Date(occurredAt).getTime();
  if (t > new Date(window.endsAt).getTime()) return false;
  if (window.startsAt && t < new Date(window.startsAt).getTime()) return false;
  return true;
}

export function filterByWindow(evidence: GrowthEvidence[], window: TimeWindow): GrowthEvidence[] {
  return evidence.filter((e) => withinWindow(e.occurredAt, window));
}

export function byDimension(evidence: GrowthEvidence[]): Map<string, GrowthEvidence[]> {
  const map = new Map<string, GrowthEvidence[]>();
  for (const e of evidence) {
    const list = map.get(e.dimension) ?? [];
    list.push(e);
    map.set(e.dimension, list);
  }
  return map;
}

export function distinctChallengeFamilies(evidence: GrowthEvidence[]): number {
  const families = new Set(evidence.map((e) => e.challengeFamily).filter((f): f is string => Boolean(f)));
  return families.size;
}

export function successRate(evidence: GrowthEvidence[]): number {
  if (evidence.length === 0) return 0;
  const weight = (o: GrowthEvidence["outcome"]) => (o === "SUCCESS" ? 1 : o === "PARTIAL" ? 0.5 : 0);
  return evidence.reduce((sum, e) => sum + weight(e.outcome), 0) / evidence.length;
}

/** Population standard deviation of outcome weights, used as the inverse
 * of "consistency" in the confidence model. */
export function outcomeVariance(evidence: GrowthEvidence[]): number {
  if (evidence.length === 0) return 0;
  const weight = (o: GrowthEvidence["outcome"]): number => (o === "SUCCESS" ? 1 : o === "PARTIAL" ? 0.5 : 0);
  const values: number[] = evidence.map((e) => weight(e.outcome));
  const avg: number = values.reduce((a, b) => a + b, 0) / values.length;
  const variance: number = values.reduce((a: number, b: number) => a + (b - avg) ** 2, 0) / values.length;
  return variance;
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function sortByOccurredAt(evidence: GrowthEvidence[]): GrowthEvidence[] {
  return [...evidence].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
}

/** Splits evidence for one dimension into a "baseline" window and a
 * "recent" window with a mandatory separation gap between them, so the two
 * windows describe genuinely different points in time rather than
 * overlapping samples of the same handful of submissions. */
export function splitBaselineVsRecent(
  evidence: GrowthEvidence[],
  recentWindowDays: number,
  minSeparationDays: number,
  now: Date = new Date(),
): { baseline: GrowthEvidence[]; recent: GrowthEvidence[] } {
  const recent = evidence.filter((e) => daysAgo(e.occurredAt, now) <= recentWindowDays);
  const baseline = evidence.filter((e) => daysAgo(e.occurredAt, now) > recentWindowDays + minSeparationDays);
  return { baseline, recent };
}
