import { describe, expect, it } from "vitest";
import { computeConfidence } from "../src/engines/evidenceConfidenceEngine.js";

describe("computeConfidence", () => {
  it("forces INSUFFICIENT below the minimum observation floor, regardless of how good other factors look", () => {
    const result = computeConfidence({
      observationCount: 2,
      recencyDaysAvg: 1,
      topicDiversity: 1,
      difficultyDiversity: 1,
      noveltyRatio: 1,
      hasTransferEvidence: true,
      hasAssessmentEvidence: true,
      hasTimedEvidence: true,
      historicalStability: 1,
    });
    expect(result.level).toBe("INSUFFICIENT");
  });

  it("reaches HIGH with abundant, diverse, recent evidence", () => {
    const result = computeConfidence({
      observationCount: 30,
      recencyDaysAvg: 2,
      topicDiversity: 0.9,
      difficultyDiversity: 0.9,
      noveltyRatio: 0.8,
      hasTransferEvidence: true,
      hasAssessmentEvidence: true,
      hasTimedEvidence: true,
      historicalStability: 0.9,
    });
    expect(result.level).toBe("HIGH");
  });

  it("scores 100 narrow, identical-difficulty questions lower than a smaller but genuinely varied set (spec section 15)", () => {
    const narrow = computeConfidence({
      observationCount: 100,
      recencyDaysAvg: 2,
      topicDiversity: 0.05,
      difficultyDiversity: 0.05,
      noveltyRatio: 0,
      hasTransferEvidence: false,
      hasAssessmentEvidence: false,
      hasTimedEvidence: false,
      historicalStability: 0.5,
    });
    const varied = computeConfidence({
      observationCount: 15,
      recencyDaysAvg: 3,
      topicDiversity: 0.8,
      difficultyDiversity: 0.8,
      noveltyRatio: 0.6,
      hasTransferEvidence: true,
      hasAssessmentEvidence: true,
      hasTimedEvidence: true,
      historicalStability: 0.7,
    });
    expect(varied.score).toBeGreaterThan(narrow.score);
  });

  it("builds a human-readable reason from the real breakdown (spec section 18's worked example)", () => {
    const result = computeConfidence({
      observationCount: 16,
      recencyDaysAvg: 3,
      topicDiversity: 0.6,
      difficultyDiversity: 0.6,
      noveltyRatio: 0.5,
      hasTransferEvidence: true,
      hasAssessmentEvidence: true,
      hasTimedEvidence: true,
      historicalStability: 0.6,
      breakdown: { assessments: 5, adaptiveSessions: 11, practiceQuestions: 0 },
    });
    expect(result.reasons[0]).toContain("5 recent assessments");
    expect(result.reasons[0]).toContain("11 adaptive sessions");
  });
});
