import { describe, it, expect } from "vitest";
import {
  evaluateSpeedAccuracy,
  evaluateNoveltyAccuracy,
  evaluateAssistanceAccuracy,
  describeDifficultyPattern,
  describeSessionPositionPattern
} from "../../src/domain/contextualSignals.js";
import type { AccuracyResult } from "../../src/types/accuracy.js";

function result(scopeId: string, accuracy: number): AccuracyResult {
  return {
    scope: "difficulty",
    scopeId,
    accuracy,
    independentAccuracy: null,
    timedAccuracy: null,
    novelAccuracy: null,
    sampleSize: 20,
    confidence: "high"
  };
}

describe("§123 — speed interaction: 60→40 sec, accuracy 94%→73%", () => {
  it("sends a pressure-reduction signal", () => {
    const { signal } = evaluateSpeedAccuracy(94, 73, true);
    expect(signal).toBe("PRESSURE_REDUCTION_SIGNAL");
  });
});

describe("§124 — safe improvement: 60→52 sec, accuracy 94%→93%", () => {
  it("sends a positive (pace-increase-ok) signal, not a pressure-reduction one", () => {
    const { signal } = evaluateSpeedAccuracy(94, 93, true);
    expect(signal).toBe("PACE_INCREASE_OK_SIGNAL");
  });
});

describe("speed signal — no comparison when pace didn't actually change", () => {
  it("returns no signal", () => {
    const { signal } = evaluateSpeedAccuracy(94, 73, false);
    expect(signal).toBeNull();
  });
});

describe("§125 — novelty: familiar 95%, novel 70%", () => {
  it("sends a transfer-precision signal and never mentions memorization", () => {
    const { signal, reason } = evaluateNoveltyAccuracy(95, 70);
    expect(signal).toBe("TRANSFER_PRECISION_SIGNAL");
    expect(reason.toLowerCase()).not.toContain("memoriz");
  });
});

describe("§126 — assistance: with hints 94%, independent 75%", () => {
  it("sends an assistance-dependency signal", () => {
    const { signal } = evaluateAssistanceAccuracy(94, 75);
    expect(signal).toBe("ASSISTANCE_DEPENDENCY_SIGNAL");
  });
});

describe("§127 — difficulty: easy 96%, hard 61%", () => {
  it("flags complexity-related degradation without calling it a global weakness", () => {
    const { complexityRelatedDegradation, reason } = describeDifficultyPattern([result("easy", 96), result("hard", 61)]);
    expect(complexityRelatedDegradation).toBe(true);
    expect(reason.toLowerCase()).not.toContain("global weakness");
  });
});

describe("§128 — session position: early 95%, late 77%", () => {
  it("flags a potential late-session accuracy drop", () => {
    const early: AccuracyResult = { ...result("early", 95), scope: "session_position" };
    const late: AccuracyResult = { ...result("late", 77), scope: "session_position" };
    const { lateSessionDrop } = describeSessionPositionPattern([early, late]);
    expect(lateSessionDrop).toBe(true);
  });
});
