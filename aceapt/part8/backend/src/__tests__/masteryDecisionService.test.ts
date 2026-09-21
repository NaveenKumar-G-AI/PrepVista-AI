import { describe, it, expect } from "vitest";
import { decideMasteryState, weightedOverallScore, buildVerifiedSnapshot } from "../services/masteryDecisionService.js";
import { computeConsistencyScore, computeTimedScore } from "../services/dimensionScoring.js";
import { assessTransfer } from "../services/transferAssessmentService.js";
import { assessRetention } from "../services/retentionService.js";
import { getMasteryModelConfig } from "../config/masteryModel.js";
import { series, makeEvidence } from "./testHelpers.js";

describe("decideMasteryState - forward progression", () => {
  it("UNKNOWN with zero evidence", () => {
    const decision = decideMasteryState({ previousState: "UNKNOWN", previousVerifiedSnapshot: null, evidence: [] });
    expect(decision.state).toBe("UNKNOWN");
    expect(decision.confidence).toBe("LOW");
  });

  it("does not jump straight from a couple of practice attempts to PROVISIONALLY_MASTERED (spec section 6/7)", () => {
    const evidence = series([{ score: 0.95 }, { score: 0.94 }]); // only 2 attempts, threshold is 3
    const decision = decideMasteryState({ previousState: "UNKNOWN", previousVerifiedSnapshot: null, evidence });
    expect(decision.state).toBe("LEARNING");
  });

  it("high practice score alone is PROVISIONAL, not immediately 'Mastered' (spec section 7's Percentages example)", () => {
    const evidence = series([{ score: 0.9 }, { score: 0.93 }, { score: 0.94 }, { score: 0.95 }]);
    const decision = decideMasteryState({ previousState: "UNKNOWN", previousVerifiedSnapshot: null, evidence });
    expect(decision.state).toBe("PROVISIONALLY_MASTERED");
    expect(decision.evidenceCounts.novel).toBe(0); // no novel-tier evidence yet - that's what's gating VERIFIED, not an undefined score
  });

  it("reaches VERIFIED_MASTERED once novel-tier transfer evidence is strong and sufficient", () => {
    const practice = series([{ score: 0.9 }, { score: 0.93 }, { score: 0.94 }, { score: 0.95 }]);
    const transferEv = [
      makeEvidence({ score: 0.86, noveltyLevel: "NOVEL", evidenceType: "TRANSFER", daysAgo: 3 }),
      makeEvidence({ score: 0.84, noveltyLevel: "NOVEL", evidenceType: "TRANSFER", daysAgo: 2 }),
      makeEvidence({ score: 0.88, noveltyLevel: "NOVEL", evidenceType: "TRANSFER", daysAgo: 1 }),
    ];
    const decision = decideMasteryState({ previousState: "UNKNOWN", previousVerifiedSnapshot: null, evidence: [...practice, ...transferEv] });
    expect(decision.state).toBe("VERIFIED_MASTERED");
  });

  it("does NOT reach VERIFIED_MASTERED when novel-tier accuracy is weak even if practice is strong (transfer weakness)", () => {
    const practice = series([{ score: 0.9 }, { score: 0.93 }, { score: 0.94 }, { score: 0.95 }]);
    const transferEv = [
      makeEvidence({ score: 0.5, noveltyLevel: "NOVEL", evidenceType: "TRANSFER", daysAgo: 3 }),
      makeEvidence({ score: 0.45, noveltyLevel: "NOVEL", evidenceType: "TRANSFER", daysAgo: 2 }),
      makeEvidence({ score: 0.55, noveltyLevel: "NOVEL", evidenceType: "TRANSFER", daysAgo: 1 }),
    ];
    const decision = decideMasteryState({ previousState: "UNKNOWN", previousVerifiedSnapshot: null, evidence: [...practice, ...transferEv] });
    expect(decision.state).toBe("PROVISIONALLY_MASTERED");
    expect(decision.rationale.some((r) => r.includes("below the verified bar"))).toBe(true);
  });
});

describe("decideMasteryState - stability (spec section 18's worked example)", () => {
  const config = getMasteryModelConfig();

  it("88/91/86 reads as stable-consistent", () => {
    const evidence = [
      makeEvidence({ score: 0.88, evidenceType: "VARIATION", noveltyLevel: "SLIGHTLY_VARIANT", daysAgo: 3 }),
      makeEvidence({ score: 0.91, evidenceType: "VARIATION", noveltyLevel: "SLIGHTLY_VARIANT", daysAgo: 2 }),
      makeEvidence({ score: 0.86, evidenceType: "VARIATION", noveltyLevel: "SLIGHTLY_VARIANT", daysAgo: 1 }),
    ];
    const result = computeConsistencyScore(evidence);
    expect(result.score).not.toBeNull();
    expect(result.score!).toBeGreaterThan(0.7);
  });

  it("94/61/89 reads as NOT stable-consistent, despite a fine mean", () => {
    const evidence = [
      makeEvidence({ score: 0.94, evidenceType: "VARIATION", noveltyLevel: "SLIGHTLY_VARIANT", daysAgo: 3 }),
      makeEvidence({ score: 0.61, evidenceType: "VARIATION", noveltyLevel: "SLIGHTLY_VARIANT", daysAgo: 2 }),
      makeEvidence({ score: 0.89, evidenceType: "VARIATION", noveltyLevel: "SLIGHTLY_VARIANT", daysAgo: 1 }),
    ];
    const result = computeConsistencyScore(evidence);
    expect(result.score).not.toBeNull();
    expect(result.score!).toBeLessThan(config.thresholds.stable.consistencyMin);
  });
});

describe("assessRetention - spec section 9 & 23", () => {
  it("a gentle decline that stays well above threshold reads as retained, not at-risk", () => {
    // Day 0 -> Day 30: 92, 88, 86, 84
    const evidence = [
      makeEvidence({ score: 0.92, evidenceType: "DELAYED", daysAgo: 30 }),
      makeEvidence({ score: 0.88, evidenceType: "DELAYED", daysAgo: 27 }),
      makeEvidence({ score: 0.86, evidenceType: "DELAYED", daysAgo: 20 }),
      makeEvidence({ score: 0.84, evidenceType: "DELAYED", daysAgo: 0 }),
    ];
    const result = assessRetention(evidence);
    expect(result.retentionScore).not.toBeNull();
    expect(result.retentionScore!).toBeGreaterThan(0.8);
    expect(result.retentionRiskDetected).toBe(false);
  });

  it("a steep decline with a real level drop is flagged as retention risk, not silently called 'forgotten'", () => {
    const evidence = [
      makeEvidence({ score: 0.91, evidenceType: "DELAYED", daysAgo: 20 }),
      makeEvidence({ score: 0.7, evidenceType: "DELAYED", daysAgo: 0 }),
    ];
    const result = assessRetention(evidence);
    expect(result.retentionRiskDetected).toBe(true);
  });

  it("time passing alone (no delayed evidence) never implies risk", () => {
    const evidence = series([{ score: 0.9 }]);
    const result = assessRetention(evidence);
    expect(result.retentionScore).toBeNull();
    expect(result.retentionRiskDetected).toBe(false);
  });
});

describe("computeTimedScore - spec section 17: knowledge retained vs timed weakness", () => {
  it("a correct-but-slow answer counts fully toward concept but is penalized in timedScore", () => {
    const slowButCorrect = [
      makeEvidence({ score: 1.0, timed: true, expectedTimeSeconds: 60, timeTakenSeconds: 120 }),
      makeEvidence({ score: 1.0, timed: true, expectedTimeSeconds: 60, timeTakenSeconds: 110 }),
    ];
    const timed = computeTimedScore(slowButCorrect);
    expect(timed.score).not.toBeNull();
    expect(timed.score!).toBeLessThan(0.7); // correct, but roughly half the expected pace
  });

  it("faster-than-expected is capped, not rewarded beyond 1.0", () => {
    const fast = [makeEvidence({ score: 1.0, timed: true, expectedTimeSeconds: 60, timeTakenSeconds: 10 })];
    const timed = computeTimedScore(fast);
    expect(timed.score).toBe(1.0);
  });
});

describe("MEMORIZATION_RISK evidence is excluded from scoring (spec section 26)", () => {
  it("a repeated-question success does not inflate concept score", () => {
    const evidence = [
      makeEvidence({ score: 0.5, daysAgo: 5 }),
      makeEvidence({ score: 0.5, daysAgo: 4 }),
      makeEvidence({ score: 0.5, daysAgo: 3 }),
      makeEvidence({ score: 1.0, daysAgo: 0, questionExposureState: "MEMORIZATION_RISK" }),
    ];
    const decision = decideMasteryState({ previousState: "UNKNOWN", previousVerifiedSnapshot: null, evidence });
    // Should reflect the three genuine 0.5 attempts, not be dragged up by the flagged 1.0
    expect(decision.dimensions.conceptScore).toBeLessThan(0.6);
  });
});

describe("regression overlay - spec section 24", () => {
  const config = getMasteryModelConfig();

  it("flags REGRESSED when a previously-verified skill drops hard from its snapshot", () => {
    const goodDims = { conceptScore: 0.9, executionScore: 0.88, transferScore: 0.85, retentionScore: 0.85, timedScore: 0.8, consistencyScore: 0.85 };
    const snapshot = buildVerifiedSnapshot(goodDims, config.dimensionWeights);

    const recentPoorEvidence = series([{ score: 0.3 }, { score: 0.35 }, { score: 0.28 }, { score: 0.32 }]);

    const decision = decideMasteryState({
      previousState: "STABLE_MASTERED",
      previousVerifiedSnapshot: snapshot,
      evidence: recentPoorEvidence,
    });

    expect(decision.state).toBe("REGRESSED");
    expect(decision.regression.flagged).toBe(true);
  });

  it("does not flag regression for a skill with no prior verified snapshot", () => {
    const recentPoorEvidence = series([{ score: 0.3 }, { score: 0.35 }, { score: 0.28 }]);
    const decision = decideMasteryState({ previousState: "UNKNOWN", previousVerifiedSnapshot: null, evidence: recentPoorEvidence });
    expect(decision.regression.flagged).toBe(false);
  });
});

describe("weightedOverallScore", () => {
  it("renormalizes over available dimensions instead of penalizing nulls", () => {
    const config = getMasteryModelConfig();
    const onlyConcept = weightedOverallScore(
      { conceptScore: 0.8, executionScore: null, transferScore: null, retentionScore: null, timedScore: null, consistencyScore: null },
      config.dimensionWeights
    );
    expect(onlyConcept).toBeCloseTo(0.8);
  });
});

describe("assessTransfer - spec section 16", () => {
  it("weights novel-tier evidence most heavily and leaves missing tiers out rather than zeroing them", () => {
    const evidence = [
      makeEvidence({ score: 0.94, noveltyLevel: "FAMILIAR" }),
      makeEvidence({ score: 0.88, noveltyLevel: "SLIGHTLY_VARIANT" }),
      makeEvidence({ score: 0.8, noveltyLevel: "NOVEL", evidenceType: "TRANSFER" }),
    ];
    const result = assessTransfer(evidence);
    expect(result.transferScore).not.toBeNull();
    // Should land closer to the novel score (0.8) than a flat average (~0.873) would
    expect(result.transferScore!).toBeLessThan(0.873);
    expect(result.tierScores.novel).toBe(0.8);
  });
});
