import { describe, expect, it } from "vitest";
import { calculateAcceleration, calculateVelocity, detectPlateau, type TimePoint } from "../trends.js";
import { detectRecovery, detectRegression } from "../regression.js";

describe("calculateVelocity", () => {
  it("detects sustained improvement (the spec's June->July->August debugging example)", () => {
    const points: TimePoint[] = [
      { value: 42, observedAt: "2026-06-01T00:00:00Z" },
      { value: 54, observedAt: "2026-07-01T00:00:00Z" },
      { value: 68, observedAt: "2026-08-01T00:00:00Z" },
    ];
    const result = calculateVelocity(points);
    expect(result.status).toBe("CALCULATED");
    expect(result.perWeek).toBeGreaterThan(0);
  });

  it("refuses to calculate velocity from sparse evidence", () => {
    const points: TimePoint[] = [
      { value: 42, observedAt: "2026-06-01T00:00:00Z" },
      { value: 54, observedAt: "2026-06-02T00:00:00Z" },
    ];
    expect(calculateVelocity(points).status).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("refuses to calculate velocity when observations are too tightly clustered in time", () => {
    const points: TimePoint[] = [
      { value: 42, observedAt: "2026-06-01T00:00:00Z" },
      { value: 44, observedAt: "2026-06-02T00:00:00Z" },
      { value: 46, observedAt: "2026-06-03T00:00:00Z" },
    ];
    expect(calculateVelocity(points).status).toBe("INSUFFICIENT_EVIDENCE");
  });
});

describe("calculateAcceleration", () => {
  it("identifies genuinely accelerating improvement", () => {
    const points: TimePoint[] = [
      { value: 50, observedAt: "2026-06-01T00:00:00Z" },
      { value: 51, observedAt: "2026-06-08T00:00:00Z" },
      { value: 52, observedAt: "2026-06-15T00:00:00Z" },
      { value: 53, observedAt: "2026-06-22T00:00:00Z" },
      { value: 56, observedAt: "2026-06-29T00:00:00Z" },
      { value: 59, observedAt: "2026-07-06T00:00:00Z" },
      { value: 60, observedAt: "2026-07-13T00:00:00Z" },
      { value: 66, observedAt: "2026-07-20T00:00:00Z" },
      { value: 74, observedAt: "2026-07-27T00:00:00Z" },
    ];
    const result = calculateAcceleration(points);
    expect(result.status).toBe("ACCELERATING");
    const [p1, p2, p3] = result.periodVelocities as [number, number, number];
    expect(p3).toBeGreaterThan(p2);
    expect(p2).toBeGreaterThan(p1);
  });

  it("does not classify ordinary noise as acceleration", () => {
    const points: TimePoint[] = [
      { value: 70, observedAt: "2026-06-01T00:00:00Z" },
      { value: 71, observedAt: "2026-06-08T00:00:00Z" },
      { value: 70, observedAt: "2026-06-15T00:00:00Z" },
      { value: 72, observedAt: "2026-06-22T00:00:00Z" },
      { value: 71, observedAt: "2026-06-29T00:00:00Z" },
      { value: 73, observedAt: "2026-07-06T00:00:00Z" },
      { value: 72, observedAt: "2026-07-13T00:00:00Z" },
      { value: 74, observedAt: "2026-07-20T00:00:00Z" },
      { value: 73, observedAt: "2026-07-27T00:00:00Z" },
    ];
    expect(calculateAcceleration(points).status).toBe("STEADY");
  });
});

describe("detectPlateau", () => {
  it("recognizes a genuine plateau (the spec's 78/79/78/80/79 example)", () => {
    const points: TimePoint[] = [
      { value: 78, observedAt: "2026-06-01T00:00:00Z" },
      { value: 79, observedAt: "2026-06-08T00:00:00Z" },
      { value: 78, observedAt: "2026-06-15T00:00:00Z" },
      { value: 80, observedAt: "2026-06-22T00:00:00Z" },
      { value: 79, observedAt: "2026-06-29T00:00:00Z" },
    ];
    expect(detectPlateau(points).status).toBe("PLATEAU");
  });

  it("does not trigger a plateau from a handful of observations", () => {
    const points: TimePoint[] = [
      { value: 78, observedAt: "2026-06-01T00:00:00Z" },
      { value: 79, observedAt: "2026-06-08T00:00:00Z" },
    ];
    expect(detectPlateau(points).status).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("does not call an actively-changing recent window a plateau", () => {
    const points: TimePoint[] = [
      { value: 55, observedAt: "2026-06-01T00:00:00Z" },
      { value: 60, observedAt: "2026-06-08T00:00:00Z" },
      { value: 78, observedAt: "2026-06-15T00:00:00Z" },
      { value: 85, observedAt: "2026-06-22T00:00:00Z" },
      { value: 91, observedAt: "2026-06-29T00:00:00Z" },
    ];
    expect(detectPlateau(points).status).toBe("NOT_PLATEAU");
  });
});

describe("detectRegression", () => {
  it("flags a sustained decline (the spec's 74/71/65/60 debugging example)", () => {
    const points: TimePoint[] = [
      { value: 74, observedAt: "2026-06-01T00:00:00Z" },
      { value: 71, observedAt: "2026-06-08T00:00:00Z" },
      { value: 65, observedAt: "2026-06-15T00:00:00Z" },
      { value: 60, observedAt: "2026-06-22T00:00:00Z" },
    ];
    const result = detectRegression(points);
    expect(result.status).toBe("REGRESSION_DETECTED");
    expect(result.event?.confirmedByConsecutiveDeclines).toBe(3);
    expect(result.event?.magnitude).toBe(14);
  });

  it("does not flag a single bad submission as a regression", () => {
    const points: TimePoint[] = [
      { value: 74, observedAt: "2026-06-01T00:00:00Z" },
      { value: 71, observedAt: "2026-06-08T00:00:00Z" },
      { value: 75, observedAt: "2026-06-15T00:00:00Z" },
      { value: 74, observedAt: "2026-06-22T00:00:00Z" },
    ];
    expect(detectRegression(points).status).toBe("NO_REGRESSION");
  });

  it("does not flag a sustained-but-tiny decline as a regression", () => {
    const points: TimePoint[] = [
      { value: 74, observedAt: "2026-06-01T00:00:00Z" },
      { value: 73, observedAt: "2026-06-08T00:00:00Z" },
      { value: 72, observedAt: "2026-06-15T00:00:00Z" },
      { value: 71, observedAt: "2026-06-22T00:00:00Z" },
    ];
    expect(detectRegression(points).status).toBe("NO_REGRESSION");
  });
});

describe("detectRecovery", () => {
  const regressionEvent = {
    type: "PERFORMANCE_DROP" as const,
    peakValue: 74,
    troughValue: 58,
    magnitude: 16,
    peakObservedAt: "2026-06-01T00:00:00Z",
    troughObservedAt: "2026-06-22T00:00:00Z",
    confirmedByConsecutiveDeclines: 3,
  };

  it("recognizes full recovery (the spec's 74->58->64->72 journey)", () => {
    const after: TimePoint[] = [
      { value: 64, observedAt: "2026-06-29T00:00:00Z" },
      { value: 72, observedAt: "2026-07-06T00:00:00Z" },
    ];
    expect(detectRecovery(regressionEvent, after).status).toBe("RECOVERED");
  });

  it("recognizes partial recovery in progress", () => {
    const after: TimePoint[] = [{ value: 66, observedAt: "2026-06-29T00:00:00Z" }];
    expect(detectRecovery(regressionEvent, after).status).toBe("RECOVERING");
  });

  it("does not call a still-low student recovered", () => {
    const after: TimePoint[] = [{ value: 59, observedAt: "2026-06-29T00:00:00Z" }];
    expect(detectRecovery(regressionEvent, after).status).toBe("NOT_RECOVERING");
  });
});
