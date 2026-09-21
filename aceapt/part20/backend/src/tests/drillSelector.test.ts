import { describe, it, expect } from "vitest";
import { chooseDrill } from "../engine/drillSelector.js";
import type { SessionEvidence, PerQuestionEvidence } from "../engine/analytics.js";

function baseEvidence(overrides: Partial<SessionEvidence>): SessionEvidence {
  return {
    correctCount: 0,
    wrongCount: 0,
    unattemptedCount: 0,
    score: 0,
    maxScore: 15,
    accuracyPct: 0,
    attemptRatePct: 0,
    totalTimeSec: 0,
    avgTimePerQuestionSec: 0,
    perQuestion: [],
    segments: [],
    degrading: false,
    overinvested: [],
    topTwoTimeSharePct: 0,
    opportunityCostEquivalentQuestions: 0,
    postErrorAccuracyPct: null,
    recoveryRatePct: null,
    recoverableCount: 0,
    speedLabel: "Moderate",
    accuracyLabel: "Moderate",
    speedAccuracyProfile: "Moderate Accuracy + Moderate Speed",
    selectionQuality: "Strong",
    biggestLeak: { type: "none", text: "" },
    navigationJumps: 0,
    ...overrides,
  };
}

function pq(concept: string, correct: boolean, attempted = true): PerQuestionEvidence {
  return {
    sequenceIndex: 0,
    questionId: `${concept}-${Math.random()}`,
    concept,
    difficulty: "Medium",
    attempted,
    correct,
    timeSec: 50,
    markedForReview: false,
    status: !attempted ? "unattempted" : correct ? "correct" : "wrong",
    decision: "Good Attempt",
  };
}

describe("chooseDrill", () => {
  it("picks the selection drill when selection quality is Weak", () => {
    const ev = baseEvidence({ selectionQuality: "Weak", biggestLeak: { type: "time-concentration", text: "leak" } });
    const choice = chooseDrill(ev);
    expect(choice.type).toBe("selection");
  });

  it("picks the selection drill whenever at least one question was overinvested, even if quality reads Moderate", () => {
    const ev = baseEvidence({
      selectionQuality: "Moderate",
      overinvested: [pq("Percentage", false)],
    });
    const choice = chooseDrill(ev);
    expect(choice.type).toBe("selection");
  });

  it("picks a concept drill targeting the lowest-accuracy attempted concept when selection was fine", () => {
    const ev = baseEvidence({
      selectionQuality: "Strong",
      overinvested: [],
      perQuestion: [
        pq("Percentage", true),
        pq("Percentage", true),
        pq("Probability", false),
        pq("Probability", false),
        pq("Ratio", true),
      ],
    });
    const choice = chooseDrill(ev);
    expect(choice.type).toBe("concept");
    expect(choice.concept).toBe("Probability");
  });

  it("ignores unattempted questions when finding the weakest concept", () => {
    const ev = baseEvidence({
      selectionQuality: "Strong",
      overinvested: [],
      perQuestion: [
        pq("Percentage", true),
        pq("Geometry", false, false), // unattempted — should not count as 0% accuracy
        pq("Ratio", false),
      ],
    });
    const choice = chooseDrill(ev);
    expect(choice.type).toBe("concept");
    expect(choice.concept).toBe("Ratio");
  });

  it("falls back to a selection drill when nothing was attempted at all", () => {
    const ev = baseEvidence({ selectionQuality: "Strong", overinvested: [], perQuestion: [] });
    const choice = chooseDrill(ev);
    expect(choice.type).toBe("selection");
  });
});
