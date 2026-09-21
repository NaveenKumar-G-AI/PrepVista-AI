import { describe, it, expect, beforeEach } from "vitest";
import { generateNarrative, answerCoachQuestion } from "../ai/anthropicAdapter.js";
import type { SessionEvidence } from "../engine/analytics.js";

const sampleEvidence: SessionEvidence = {
  correctCount: 8,
  wrongCount: 3,
  unattemptedCount: 4,
  score: 7.25,
  maxScore: 15,
  accuracyPct: 73,
  attemptRatePct: 73,
  totalTimeSec: 1000,
  avgTimePerQuestionSec: 66.7,
  perQuestion: [],
  segments: [
    { label: "Q1–5", accuracyPct: 80, attempted: 5 },
    { label: "Q6–10", accuracyPct: 70, attempted: 5 },
    { label: "Q11–15", accuracyPct: 60, attempted: 5 },
  ],
  degrading: true,
  overinvested: [
    {
      sequenceIndex: 4,
      questionId: "q5",
      concept: "Profit & Loss",
      difficulty: "Very Hard",
      attempted: true,
      correct: false,
      timeSec: 240,
      markedForReview: false,
      status: "wrong",
      decision: "Overinvestment",
    },
  ],
  topTwoTimeSharePct: 30,
  opportunityCostEquivalentQuestions: 2.6,
  postErrorAccuracyPct: 55,
  recoveryRatePct: 60,
  recoverableCount: 5,
  speedLabel: "Moderate",
  accuracyLabel: "Moderate",
  speedAccuracyProfile: "Moderate Accuracy + Moderate Speed",
  selectionQuality: "Weak",
  biggestLeak: { type: "time-concentration", text: "One question consumed 24% of your total test time.", questionNumbers: [5] },
  navigationJumps: 2,
};

describe("AI adapter — no API key configured (the shipped default)", () => {
  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("generateNarrative falls back to the deterministic template and says so", async () => {
    const result = await generateNarrative(sampleEvidence);
    expect(result.source).toBe("fallback");
    expect(result.text).toContain("7.25");
    expect(result.text.length).toBeGreaterThan(20);
  });

  it("answerCoachQuestion falls back for each canned prompt key without throwing", async () => {
    for (const key of ["analyze", "time", "skip", "drop"]) {
      const result = await answerCoachQuestion(key, sampleEvidence);
      expect(result.source).toBe("fallback");
      expect(typeof result.text).toBe("string");
      expect(result.text.length).toBeGreaterThan(10);
    }
  });

  it("the 'time' fallback answer references the actual overinvested question number", async () => {
    const result = await answerCoachQuestion("time", sampleEvidence);
    expect(result.text).toContain("5");
  });
});
