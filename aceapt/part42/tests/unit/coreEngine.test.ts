import { describe, it, expect } from "vitest";
import { computeEvidence } from "../../src/engine/evidenceQuality.js";
import { classifyTiming, isImplausiblyFast } from "../../src/engine/timingIntelligence.js";
import { deriveConfidenceState, deriveStatus, estimateFromEvidence } from "../../src/engine/capabilityEstimator.js";
import { analyzeConsistency } from "../../src/engine/consistency.js";
import { evaluateStoppingRule } from "../../src/engine/stoppingRule.js";
import { scoreCandidate } from "../../src/engine/questionSelection.js";
import { assessConfidenceCalibration } from "../../src/engine/confidence.js";
import { makeTestBlueprint, NODE } from "../fixtures/blueprintFixture.js";
import type { RawResponseInput } from "../../src/types/domain.js";

function baseResponse(overrides: Partial<RawResponseInput> = {}): RawResponseInput {
  return {
    clientResponseId: "r1",
    questionId: "q1",
    skillNodeId: NODE.percentageBasics,
    answer: "A",
    isCorrect: true,
    questionDifficulty: "medium",
    expectedDurationMs: 30000,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: 28000,
    hintUsed: false,
    attemptNumber: 1,
    wasPreviouslyExposed: false,
    ...overrides,
  };
}

describe("timingIntelligence", () => {
  it("classifies relative to expected time, not absolute seconds", () => {
    // 90s is "fast" against a 3-minute-expected question...
    expect(classifyTiming(90_000, 180_000, true)).toBe("fast_correct");
    // ...and "slow" against a 20-second-expected one.
    expect(classifyTiming(90_000, 20_000, true)).toBe("slow_correct");
  });

  it("treats a skip (isCorrect=null) as its own category regardless of timing", () => {
    expect(classifyTiming(1000, 30000, null)).toBe("skipped");
  });

  it("flags implausibly fast answers below a floor, not just 'fast'", () => {
    expect(isImplausiblyFast(500, 45000)).toBe(true);
    expect(isImplausiblyFast(20000, 45000)).toBe(false); // fast but plausible
  });
});

describe("evidenceQuality — Module 10", () => {
  it("discounts hint-assisted correct answers ('correct after assistance ≠ independent correct')", () => {
    const withHint = computeEvidence({ response: baseResponse({ hintUsed: true }), priorExposureCount: 0 });
    const withoutHint = computeEvidence({ response: baseResponse({ hintUsed: false }), priorExposureCount: 0 });
    expect(withHint.evidenceWeight).toBeLessThan(withoutHint.evidenceWeight);
    expect(withHint.qualityFlags).toContain("hint_assisted");
  });

  it("decays weight with repeated exposure ('repeated exposure ≠ independent mastery')", () => {
    const fresh = computeEvidence({ response: baseResponse(), priorExposureCount: 0 });
    const seenOnce = computeEvidence({ response: baseResponse(), priorExposureCount: 1 });
    const seenManyTimes = computeEvidence({ response: baseResponse(), priorExposureCount: 5 });
    expect(seenOnce.evidenceWeight).toBeLessThan(fresh.evidenceWeight);
    expect(seenManyTimes.evidenceWeight).toBeLessThan(seenOnce.evidenceWeight);
  });

  it("gives a skip zero evidence weight", () => {
    const skipped = computeEvidence({ response: baseResponse({ isCorrect: null, answer: null }), priorExposureCount: 0 });
    expect(skipped.evidenceWeight).toBe(0);
    expect(skipped.qualityFlags).toContain("skipped_question");
  });

  it("never produces a negative or >1 weight regardless of how many discounts stack", () => {
    const worstCase = computeEvidence({
      response: baseResponse({ hintUsed: true, durationMs: 100, expectedDurationMs: 45000, confidence: 1 }),
      priorExposureCount: 10,
    });
    expect(worstCase.evidenceWeight).toBeGreaterThanOrEqual(0);
    expect(worstCase.evidenceWeight).toBeLessThanOrEqual(1);
  });
});

describe("capabilityEstimator — Module 11/13", () => {
  it("derives confidence state purely from evidence count and consistency, independent of the point estimate", () => {
    expect(deriveConfidenceState(0, 4, false)).toBe("incomplete");
    expect(deriveConfidenceState(2, 4, false)).toBe("low");
    expect(deriveConfidenceState(5, 4, false)).toBe("moderate");
    expect(deriveConfidenceState(9, 4, false)).toBe("high");
    expect(deriveConfidenceState(9, 4, true)).toBe("conflicted"); // consistency overrides count
  });

  it("never labels a status from zero evidence, even though the prior would compute to 0.5", () => {
    const { pointEstimate } = estimateFromEvidence([]);
    expect(pointEstimate).toBeCloseTo(0.5); // the flat prior, on its own
    expect(deriveStatus(pointEstimate, "incomplete")).toBe("insufficient_evidence");
  });

  it("shrinks toward the prior with sparse evidence and converges toward the true rate with more", () => {
    const sparse = estimateFromEvidence([{ isCorrect: true, evidenceWeight: 1 }]);
    const plenty = estimateFromEvidence(Array.from({ length: 20 }, () => ({ isCorrect: true, evidenceWeight: 1 })));
    expect(sparse.pointEstimate).toBeLessThan(plenty.pointEstimate); // one win shouldn't already read as "strong"
    expect(plenty.pointEstimate).toBeGreaterThan(0.85);
  });
});

describe("consistency — Module 20", () => {
  it("does not call a pattern inconsistent from too little evidence", () => {
    const result = analyzeConsistency("skill-1", [true, false, true]);
    expect(result.isConsistent).toBe(true);
    expect(result.note).toMatch(/insufficient/);
  });

  it("does not flag a genuinely steady 70% as inconsistent", () => {
    const steady = [true, true, false, true, true, false, true, true, false, true, true, false];
    const result = analyzeConsistency("skill-1", steady);
    expect(result.isConsistent).toBe(true);
  });
});

describe("confidence calibration — Module 9", () => {
  it("refuses to call a pattern from fewer than 3 observations in the relevant bucket", () => {
    const result = assessConfidenceCalibration([
      { confidence: 5, isCorrect: false },
      { confidence: 5, isCorrect: false },
    ]);
    expect(result.pattern).toBe("insufficient_evidence");
  });

  it("does not confuse 'low confidence + wrong' (well-calibrated) with underconfidence", () => {
    // low confidence, MOSTLY wrong — this is accurate self-assessment, not underconfidence
    const result = assessConfidenceCalibration([
      { confidence: 1, isCorrect: false },
      { confidence: 1, isCorrect: false },
      { confidence: 2, isCorrect: false },
      { confidence: 1, isCorrect: true },
    ]);
    expect(result.underconfident).toBe(false);
  });
});

describe("stoppingRule — Module 12", () => {
  const blueprint = makeTestBlueprint(4);

  it("does not stop while any domain is under-covered", () => {
    const decision = evaluateStoppingRule({
      blueprint,
      evidenceCountBySkill: new Map(),
      totalQuestionsAsked: 5,
      maxQuestions: 40,
      fatigueDetected: false,
    });
    expect(decision.shouldStop).toBe(false);
  });

  it("stops once every leaf skill has met its blueprint minimum", () => {
    const fullyCovered = new Map(blueprint.nodes.filter((n) => n.level === "skill").map((n) => [n.id, n.minEvidenceCount]));
    const decision = evaluateStoppingRule({
      blueprint,
      evidenceCountBySkill: fullyCovered,
      totalQuestionsAsked: 20,
      maxQuestions: 40,
      fatigueDetected: false,
    });
    expect(decision).toEqual({ shouldStop: true, reason: "coverage_and_confidence_met" });
  });

  it("stops early on fatigue even with incomplete coverage — evidence quality matters more than finishing", () => {
    const decision = evaluateStoppingRule({
      blueprint,
      evidenceCountBySkill: new Map(),
      totalQuestionsAsked: 5,
      maxQuestions: 40,
      fatigueDetected: true,
    });
    expect(decision).toEqual({ shouldStop: true, reason: "fatigue_detected" });
  });

  it("respects the safety-valve max regardless of coverage", () => {
    const decision = evaluateStoppingRule({
      blueprint,
      evidenceCountBySkill: new Map(),
      totalQuestionsAsked: 40,
      maxQuestions: 40,
      fatigueDetected: false,
    });
    expect(decision).toEqual({ shouldStop: true, reason: "max_questions_reached" });
  });
});

describe("questionSelection — Module 4/31", () => {
  const blueprint = makeTestBlueprint(4);
  const skillNode = blueprint.nodes.find((n) => n.id === NODE.percentageBasics)!;

  it("hard-excludes retired questions", () => {
    const score = scoreCandidate(
      { id: "q1", domain: "quant", topic: "arithmetic", subtopic: "percentage", skillNodeId: NODE.percentageBasics, difficulty: "medium", expectedTimeMs: 30000, questionType: "mcq", qualityStatus: "retired" },
      skillNode,
      { skillSnapshots: new Map(), exposures: new Map() },
    );
    expect(score).toBe(-Infinity);
  });

  it("penalizes but does not exclude a previously-seen question (graceful degradation for a small pool)", () => {
    const question = { id: "q1", domain: "quant", topic: "arithmetic", subtopic: "percentage", skillNodeId: NODE.percentageBasics, difficulty: "medium" as const, expectedTimeMs: 30000, questionType: "mcq", qualityStatus: "active" as const };
    const freshScore = scoreCandidate(question, skillNode, { skillSnapshots: new Map(), exposures: new Map() });
    const seenScore = scoreCandidate(question, skillNode, { skillSnapshots: new Map(), exposures: new Map([["q1", 2]]) });
    expect(seenScore).toBeLessThan(freshScore);
    expect(seenScore).toBeGreaterThan(-Infinity); // still selectable if nothing else exists
  });

  it("prioritizes a skill with zero evidence over one already at its minimum", () => {
    const question = { id: "q1", domain: "quant", topic: "arithmetic", subtopic: "percentage", skillNodeId: NODE.percentageBasics, difficulty: "medium" as const, expectedTimeMs: 30000, questionType: "mcq", qualityStatus: "active" as const };
    const uncovered = scoreCandidate(question, skillNode, { skillSnapshots: new Map(), exposures: new Map() });
    const covered = scoreCandidate(question, skillNode, {
      skillSnapshots: new Map([[NODE.percentageBasics, { pointEstimate: 0.6, confidenceState: "high", evidenceCount: 8 }]]),
      exposures: new Map(),
    });
    expect(uncovered).toBeGreaterThan(covered);
  });
});
