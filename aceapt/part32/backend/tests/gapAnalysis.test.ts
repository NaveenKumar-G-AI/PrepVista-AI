import { describe, expect, it } from "vitest";
import { computeCapabilityGaps, computeConfidence, computeTrend } from "../src/services/gapAnalysis.service.js";
import type { AssessmentAttempt, RoleRubric } from "../src/types/domain.js";

function attempt(capabilityId: string, score: number, takenAt: string): AssessmentAttempt {
  return { id: `${capabilityId}-${takenAt}`, studentId: "s1", capabilityId, score, takenAt, source: "practice_set" };
}

const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();

describe("computeTrend", () => {
  it("returns INSUFFICIENT_DATA with fewer than two attempts", () => {
    expect(computeTrend([])).toBe("INSUFFICIENT_DATA");
    expect(computeTrend([attempt("dsa", 50, iso(1))])).toBe("INSUFFICIENT_DATA");
  });

  it("detects an improving trend", () => {
    const attempts = [attempt("dsa", 40, iso(20)), attempt("dsa", 50, iso(10)), attempt("dsa", 62, iso(1))];
    expect(computeTrend(attempts)).toBe("IMPROVING");
  });

  it("detects a declining trend", () => {
    const attempts = [attempt("dsa", 70, iso(20)), attempt("dsa", 60, iso(1))];
    expect(computeTrend(attempts)).toBe("DECLINING");
  });

  it("treats small fluctuations as stable, not a trend", () => {
    const attempts = [attempt("dsa", 60, iso(20)), attempt("dsa", 62, iso(1))];
    expect(computeTrend(attempts)).toBe("STABLE");
  });
});

describe("computeConfidence", () => {
  it("is INSUFFICIENT_DATA with zero evidence", () => {
    expect(computeConfidence(0, null)).toBe("INSUFFICIENT_DATA");
  });

  it("requires both enough attempts AND recency for HIGH", () => {
    expect(computeConfidence(3, iso(10))).toBe("HIGH");
    expect(computeConfidence(3, iso(200))).not.toBe("HIGH"); // stale, despite 3 attempts
    expect(computeConfidence(1, iso(10))).not.toBe("HIGH"); // not enough attempts
  });

  it("degrades to LOW once evidence is stale", () => {
    expect(computeConfidence(5, iso(500))).toBe("LOW");
  });
});

describe("computeCapabilityGaps", () => {
  const rubric: RoleRubric = {
    roleId: "swe_entry",
    roleName: "Software Engineer (Entry Level)",
    entries: [
      { capabilityId: "dsa", weight: 0.35, targetBar: 70 },
      { capabilityId: "comm", weight: 0.15, targetBar: 65 },
    ],
  };

  it("never fabricates a score for a capability with no evidence", () => {
    const gaps = computeCapabilityGaps(rubric, []);
    const dsaGap = gaps.find((g) => g.capabilityId === "dsa")!;
    const commGap = gaps.find((g) => g.capabilityId === "comm")!;
    expect(commGap.currentScore).toBeNull();
    expect(commGap.gap).toBeNull();
    expect(commGap.confidence).toBe("INSUFFICIENT_DATA");
    expect(dsaGap.currentScore).toBeNull();
  });

  it("still assigns priority to an unassessed but high-weight capability", () => {
    const gaps = computeCapabilityGaps(rubric, []);
    const dsaGap = gaps.find((g) => g.capabilityId === "dsa")!;
    expect(dsaGap.priorityScore).toBeGreaterThan(0);
  });

  it("marks a capability on-track once the latest score clears the bar", () => {
    const attempts = [attempt("dsa", 75, iso(2))];
    const gaps = computeCapabilityGaps(rubric, attempts);
    const dsaGap = gaps.find((g) => g.capabilityId === "dsa")!;
    expect(dsaGap.onTrack).toBe(true);
    expect(dsaGap.gap).toBe(0);
  });

  it("does not declare mastery from a single attempt (trend stays INSUFFICIENT_DATA)", () => {
    const attempts = [attempt("dsa", 80, iso(1))];
    const gaps = computeCapabilityGaps(rubric, attempts);
    const dsaGap = gaps.find((g) => g.capabilityId === "dsa")!;
    expect(dsaGap.trend).toBe("INSUFFICIENT_DATA");
    expect(dsaGap.evidenceCount).toBe(1);
  });
});
