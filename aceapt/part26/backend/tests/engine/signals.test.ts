import { describe, expect, it } from "vitest";
import {
  computeConfidence,
  computeMomentum,
  computePersistentErrorPattern,
  computeRegression,
  computeStability,
  detectFatigue
} from "../../src/engine/signals";

describe("computeConfidence", () => {
  it("is LOW below the low-sample threshold (section 18)", () => {
    expect(computeConfidence(2)).toBe("LOW");
  });
  it("is MEDIUM in the middle range", () => {
    expect(computeConfidence(5)).toBe("MEDIUM");
  });
  it("is HIGH at/above the high-sample threshold", () => {
    expect(computeConfidence(8)).toBe("HIGH");
    expect(computeConfidence(20)).toBe("HIGH");
  });
});

describe("computeMomentum (section 21)", () => {
  it("detects positive momentum: 62 -> 68 -> 73 -> 79", () => {
    expect(computeMomentum([62, 68, 73, 79]).momentum).toBe("IMPROVING");
  });

  it("flags a slow erosion from a high base as a note, not a false DECLINING alarm: 82 -> 81 -> 80 -> 78", () => {
    const result = computeMomentum([82, 81, 80, 78]);
    expect(result.momentum).toBe("FLAT");
    expect(result.trendNote).toBeTruthy();
  });

  it("needs at least 4 points before saying anything", () => {
    expect(computeMomentum([70, 72]).momentum).toBe("UNKNOWN");
  });

  it("detects clear decline", () => {
    expect(computeMomentum([78, 74, 69, 65, 60]).momentum).toBe("DECLINING");
  });
});

describe("computeStability (section 19)", () => {
  it("marks repeated high, tight scores as stable", () => {
    expect(computeStability([90, 92, 91])).toBe("STABLE");
  });
  it("does not call volatile scores stable even if the average is high", () => {
    expect(computeStability([70, 95, 98])).toBe("UNSTABLE");
  });
  it("needs at least 3 points", () => {
    expect(computeStability([95, 96])).toBe("UNKNOWN");
  });
});

describe("computeRegression (section 20)", () => {
  it("flags the document's own sudden-drop example: 82 -> 79 -> 73 -> 54", () => {
    const result = computeRegression([82, 79, 73, 54]);
    expect(result.regressionSuspected).toBe(true);
    expect(result.possibleCauses.length).toBeGreaterThan(0);
  });

  it("does not flag gradual, non-sudden decay as a regression", () => {
    const result = computeRegression([78, 74, 69, 65, 60]);
    expect(result.regressionSuspected).toBe(false);
  });

  it("never concludes a single named cause - only a set of hypotheses", () => {
    const result = computeRegression([82, 79, 73, 54]);
    expect(result.possibleCauses.length).toBeGreaterThan(1);
  });
});

describe("computePersistentErrorPattern (section 22)", () => {
  it("does not flag a single wrong-method instance", () => {
    expect(computePersistentErrorPattern(["method_error"]).tag).toBeNull();
  });
  it("flags a recurring tag within the recent window, with severity derived from how much of the window it occupies", () => {
    const result = computePersistentErrorPattern([
      "careless",
      "method_error",
      "method_error",
      "careless",
      "method_error"
    ]);
    expect(result.tag).toBe("method_error");
    expect(result.severity).toBeCloseTo(0.6, 5); // 3 of the last 5 entries
  });
});

describe("detectFatigue (section 35)", () => {
  it("does not flag fatigue from a single completed action", () => {
    expect(detectFatigue([{ topicId: "x", accuracy: 0.9, avgResponseTimeSeconds: 20, at: "now" }])).toBe(false);
  });

  it("flags fatigue when accuracy drops and pace slows together", () => {
    const results = [
      { topicId: "x", accuracy: 0.9, avgResponseTimeSeconds: 20, at: "t1" },
      { topicId: "y", accuracy: 0.6, avgResponseTimeSeconds: 35, at: "t2" }
    ];
    expect(detectFatigue(results)).toBe(true);
  });

  it("does not flag fatigue when only one of the two signals moves", () => {
    const results = [
      { topicId: "x", accuracy: 0.9, avgResponseTimeSeconds: 20, at: "t1" },
      { topicId: "y", accuracy: 0.85, avgResponseTimeSeconds: 40, at: "t2" } // slower, but accuracy barely moved
    ];
    expect(detectFatigue(results)).toBe(false);
  });
});
