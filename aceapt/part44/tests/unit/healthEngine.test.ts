import { describe, expect, it } from "vitest";
import { computeHealth } from "../../src/engines/healthEngine.js";

describe("healthEngine.computeHealth", () => {
  it("reports PAUSED/COMPLETED directly from status, no trend analysis needed", () => {
    expect(
      computeHealth({ status: "PAUSED", snapshots: [], daysRemaining: 5, totalDurationDays: 30, daysElapsedSinceCreation: 10 }).health
    ).toBe("PAUSED");
    expect(
      computeHealth({ status: "COMPLETED", snapshots: [], daysRemaining: 5, totalDurationDays: 30, daysElapsedSinceCreation: 10 }).health
    ).toBe("COMPLETED");
  });

  it("defaults a brand-new goal to HEALTHY with LOW confidence rather than guessing a trend", () => {
    const result = computeHealth({
      status: "ACTIVE",
      snapshots: [{ capturedAt: new Date().toISOString(), progress: 0 }],
      daysRemaining: 30,
      totalDurationDays: 30,
      daysElapsedSinceCreation: 0,
    });
    expect(result.health).toBe("HEALTHY");
    expect(result.confidence).toBe("LOW");
  });

  it("marks IMPROVING when recent progress rose meaningfully", () => {
    const result = computeHealth({
      status: "ACTIVE",
      snapshots: [
        { capturedAt: "2026-08-01T00:00:00Z", progress: 20 },
        { capturedAt: "2026-08-10T00:00:00Z", progress: 30 },
      ],
      daysRemaining: 20,
      totalDurationDays: 30,
      daysElapsedSinceCreation: 10,
    });
    expect(result.health).toBe("IMPROVING");
    expect(result.reason).toContain("10");
  });

  it("marks AT_RISK when badly behind schedule AND the deadline is imminent", () => {
    const result = computeHealth({
      status: "ACTIVE",
      snapshots: [
        { capturedAt: "2026-08-01T00:00:00Z", progress: 10 },
        { capturedAt: "2026-08-25T00:00:00Z", progress: 12 },
      ],
      daysRemaining: 2,
      totalDurationDays: 30,
      daysElapsedSinceCreation: 28,
    });
    expect(result.health).toBe("AT_RISK");
  });

  it("marks NEEDS_ATTENTION (not AT_RISK) when behind schedule but the deadline isn't imminent yet", () => {
    const result = computeHealth({
      status: "ACTIVE",
      snapshots: [
        { capturedAt: "2026-08-01T00:00:00Z", progress: 5 },
        { capturedAt: "2026-08-10T00:00:00Z", progress: 6 },
      ],
      daysRemaining: 60,
      totalDurationDays: 90,
      daysElapsedSinceCreation: 30,
    });
    expect(result.health).toBe("NEEDS_ATTENTION");
  });

  it("marks NEEDS_ATTENTION on a real regression even when on schedule overall", () => {
    const result = computeHealth({
      status: "ACTIVE",
      snapshots: [
        { capturedAt: "2026-08-01T00:00:00Z", progress: 40 },
        { capturedAt: "2026-08-10T00:00:00Z", progress: 35 },
      ],
      daysRemaining: 60,
      totalDurationDays: 90,
      daysElapsedSinceCreation: 30,
    });
    expect(result.health).toBe("NEEDS_ATTENTION");
  });
});
