import { describe, expect, it, vi } from "vitest";
import { computeDaysRemaining, resolveTargetDate } from "../../src/services/goalService.js";

// Regression test for a real bug the frontend E2E test caught: a goal
// created with "30 days from now" rendered as "31 DAYS REMAINING" on
// its own creation day, because the old implementation compared a
// precise `now` timestamp against the target's 23:59:59 cutoff and
// rounded up. Comparing calendar dates at UTC midnight removes the
// time-of-day sensitivity entirely.
describe("goalService date helpers", () => {
  it("computeDaysRemaining is stable across time-of-day, not just at midnight", () => {
    const morning = new Date("2026-08-31T00:05:00Z");
    const evening = new Date("2026-08-31T23:55:00Z");
    const target = resolveTargetDate("DAYS_FROM_NOW", 30, undefined)!;

    vi.useFakeTimers();
    try {
      vi.setSystemTime(morning);
      const target1 = resolveTargetDate("DAYS_FROM_NOW", 30, undefined)!;
      expect(computeDaysRemaining(target1)).toBe(30);

      vi.setSystemTime(evening);
      const target2 = resolveTargetDate("DAYS_FROM_NOW", 30, undefined)!;
      expect(computeDaysRemaining(target2)).toBe(30);
    } finally {
      vi.useRealTimers();
    }
    void target;
  });

  it("reads exactly N on creation day for every N, not N+1 (the actual regression)", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T08:09:26Z")); // the exact moment that exposed the bug
    try {
      for (const n of [1, 7, 14, 30, 90]) {
        const target = resolveTargetDate("DAYS_FROM_NOW", n, undefined)!;
        expect(computeDaysRemaining(target)).toBe(n);
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("reads 0 on the deadline day itself and negative once passed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-31T12:00:00Z"));
    try {
      expect(computeDaysRemaining("2026-08-31")).toBe(0);
      expect(computeDaysRemaining("2026-08-30")).toBe(-1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns null for NONE/UNKNOWN deadlines rather than inventing a date (Section 47)", () => {
    expect(resolveTargetDate("NONE", undefined, undefined)).toBeNull();
    expect(resolveTargetDate("UNKNOWN", undefined, undefined)).toBeNull();
    expect(computeDaysRemaining(null)).toBeNull();
  });

  it("uses an explicit date as-is for EXACT_DATE", () => {
    expect(resolveTargetDate("EXACT_DATE", undefined, "2026-12-25")).toBe("2026-12-25");
  });
});
