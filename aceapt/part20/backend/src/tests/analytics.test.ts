import { describe, it, expect } from "vitest";
import { computeAnalytics } from "../engine/analytics.js";
import type { EngineQuestion, EngineResponse, EngineEvent } from "../engine/types.js";

const marking = { correct: 1, wrong: -0.25, skip: 0 };

// A 9-question fixture, hand-scored in the build notes before this test was
// written, so this test is checking the engine against arithmetic worked out
// independently — not against whatever the engine happens to produce.
//
//  # difficulty  result       timeSec
//  1 Easy        correct      30
//  2 Medium      correct      40
//  3 Hard        WRONG        250   <- overinvestment
//  4 Easy        correct      35
//  5 Very Hard   WRONG        45
//  6 Medium      correct      50
//  7 Easy        unattempted  5     (viewed briefly, skipped)
//  8 Hard        correct      60
//  9 Medium      WRONG        55
//
// total time = 570s, avg/question = 63.33s

const questions: EngineQuestion[] = [
  { id: "q1", sequenceIndex: 0, concept: "Percentage", difficulty: "Easy", correctIndex: 0 },
  { id: "q2", sequenceIndex: 1, concept: "Time & Work", difficulty: "Medium", correctIndex: 0 },
  { id: "q3", sequenceIndex: 2, concept: "Data Interpretation", difficulty: "Hard", correctIndex: 0 },
  { id: "q4", sequenceIndex: 3, concept: "Number System", difficulty: "Easy", correctIndex: 0 },
  { id: "q5", sequenceIndex: 4, concept: "Profit & Loss", difficulty: "Very Hard", correctIndex: 0 },
  { id: "q6", sequenceIndex: 5, concept: "Ratio", difficulty: "Medium", correctIndex: 0 },
  { id: "q7", sequenceIndex: 6, concept: "Averages", difficulty: "Easy", correctIndex: 0 },
  { id: "q8", sequenceIndex: 7, concept: "Probability", difficulty: "Hard", correctIndex: 0 },
  { id: "q9", sequenceIndex: 8, concept: "Algebra", difficulty: "Medium", correctIndex: 0 },
];

function resp(
  questionId: string,
  opts: { selectedIndex: number | null; timeSec: number; marked?: boolean }
): [string, EngineResponse] {
  return [
    questionId,
    {
      questionId,
      status: opts.selectedIndex === null ? "viewed" : "answered",
      selectedIndex: opts.selectedIndex,
      markedForReview: !!opts.marked,
      timeSpentMs: opts.timeSec * 1000,
      visits: 1,
    },
  ];
}

const responses = new Map<string, EngineResponse>([
  resp("q1", { selectedIndex: 0, timeSec: 30 }), // correct
  resp("q2", { selectedIndex: 0, timeSec: 40 }), // correct
  resp("q3", { selectedIndex: 1, timeSec: 250 }), // wrong, overinvested
  resp("q4", { selectedIndex: 0, timeSec: 35 }), // correct
  resp("q5", { selectedIndex: 1, timeSec: 45 }), // wrong
  resp("q6", { selectedIndex: 0, timeSec: 50 }), // correct
  resp("q7", { selectedIndex: null, timeSec: 5 }), // unattempted
  resp("q8", { selectedIndex: 0, timeSec: 60 }), // correct
  resp("q9", { selectedIndex: 1, timeSec: 55 }), // wrong
]);

const events: EngineEvent[] = [
  { type: "NAVIGATED", questionId: null, fromIndex: 0, toIndex: 1, occurredAt: "2026-01-01T00:00:01Z" },
  { type: "NAVIGATED", questionId: null, fromIndex: 1, toIndex: 2, occurredAt: "2026-01-01T00:00:02Z" },
  { type: "NAVIGATED", questionId: null, fromIndex: 2, toIndex: 3, occurredAt: "2026-01-01T00:00:03Z" },
  { type: "NAVIGATED", questionId: null, fromIndex: 3, toIndex: 4, occurredAt: "2026-01-01T00:00:04Z" },
  { type: "NAVIGATED", questionId: null, fromIndex: 4, toIndex: 5, occurredAt: "2026-01-01T00:00:05Z" },
  { type: "NAVIGATED", questionId: null, fromIndex: 5, toIndex: 6, occurredAt: "2026-01-01T00:00:06Z" },
  { type: "NAVIGATED", questionId: null, fromIndex: 6, toIndex: 7, occurredAt: "2026-01-01T00:00:07Z" },
  { type: "NAVIGATED", questionId: null, fromIndex: 7, toIndex: 8, occurredAt: "2026-01-01T00:00:08Z" },
  { type: "NAVIGATED", questionId: null, fromIndex: 8, toIndex: 2, occurredAt: "2026-01-01T00:00:09Z" }, // late review jump
];

describe("computeAnalytics — 9-question fixture", () => {
  const ev = computeAnalytics(questions, responses, events, 570, marking);

  it("scores correctly (5 correct, 3 wrong, 1 unattempted)", () => {
    expect(ev.correctCount).toBe(5);
    expect(ev.wrongCount).toBe(3);
    expect(ev.unattemptedCount).toBe(1);
    expect(ev.score).toBeCloseTo(4.25, 5);
    expect(ev.maxScore).toBe(9);
  });

  it("computes accuracy on attempted questions only (5/8 = 63%)", () => {
    expect(ev.accuracyPct).toBe(63);
    expect(ev.attemptRatePct).toBe(89); // 8/9
  });

  it("computes total time and average time per question", () => {
    expect(ev.totalTimeSec).toBe(570);
    expect(ev.avgTimePerQuestionSec).toBeCloseTo(63.33, 1);
  });

  it("flags Q3 as overinvested and nothing else", () => {
    const ids = ev.overinvested.map((p) => p.questionId);
    expect(ids).toEqual(["q3"]);
  });

  it("identifies Q3 and Q8 as the top two time-consuming questions and reports their combined share", () => {
    expect(ev.topTwoTimeSharePct).toBe(54); // (250+60)/570
  });

  it("estimates opportunity cost in equivalent-question units", () => {
    // extra time = 250 - 63.33 = 186.67 -> /63.33 ≈ 2.9
    expect(ev.opportunityCostEquivalentQuestions).toBeCloseTo(2.9, 1);
  });

  it("splits into three segments of three questions each with correct per-segment accuracy", () => {
    expect(ev.segments).toHaveLength(3);
    expect(ev.segments[0].accuracyPct).toBe(67); // Q1,Q2 correct / Q3 wrong -> 2/3
    expect(ev.segments[1].accuracyPct).toBe(67); // Q4,Q6 correct / Q5 wrong -> 2/3
    expect(ev.segments[2].accuracyPct).toBe(50); // Q8 correct / Q9 wrong, Q7 unattempted -> 1/2
  });

  it("flags degradation when first-segment accuracy exceeds last-segment accuracy by >= 15 points", () => {
    expect(ev.degrading).toBe(true); // 67 - 50 = 17
  });

  it("computes recovery rate after hard misses (both Q3->Q4 and Q5->Q6 recovered)", () => {
    expect(ev.recoverableCount).toBe(2);
    expect(ev.recoveryRatePct).toBe(100);
  });

  it("computes post-error accuracy across the two questions following each miss", () => {
    // after Q3(wrong): Q4 correct, Q5 wrong -> 1/2
    // after Q5(wrong): Q6 correct, Q7 unattempted(not counted) -> 1/1
    // after Q9(wrong): no questions follow -> 0/0
    // total = 2/3 -> 67%
    expect(ev.postErrorAccuracyPct).toBe(67);
  });

  it("counts exactly one non-sequential navigation jump", () => {
    expect(ev.navigationJumps).toBe(1);
  });

  it("classifies the speed/accuracy profile", () => {
    expect(ev.speedLabel).toBe("Moderate");
    expect(ev.accuracyLabel).toBe("Moderate");
    expect(ev.speedAccuracyProfile).toBe("Moderate Accuracy + Moderate Speed");
  });

  it("rates question-selection quality as Weak given the time concentration on Q3", () => {
    expect(ev.selectionQuality).toBe("Weak");
  });

  it("headlines the time-concentration leak over the also-true degradation signal", () => {
    expect(ev.biggestLeak.type).toBe("time-concentration");
    expect(ev.biggestLeak.questionNumbers).toEqual([3, 8]);
  });

  it("produces one classified decision per question, in sequence order", () => {
    expect(ev.perQuestion).toHaveLength(9);
    expect(ev.perQuestion.map((p) => p.sequenceIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(ev.perQuestion[2].decision).toBe("Overinvestment"); // Q3
    expect(ev.perQuestion[6].decision).toBe("Bad Skip"); // Q7: Easy, skipped after a brief look
  });
});

describe("computeAnalytics — clean run edge case", () => {
  it("reports selectionQuality Strong and biggestLeak 'none' when time and accuracy are both even", () => {
    // Uses 15 questions (the real main-blueprint size) rather than a small N:
    // topTwoTimeSharePct is naturally ~2/N even under perfectly even pacing,
    // so this metric is only meaningful at the question count it was
    // calibrated for (see ANALYTICS_THRESHOLDS + main blueprint = 15Q).
    const evenQuestions: EngineQuestion[] = Array.from({ length: 15 }, (_, i) => ({
      id: `e${i}`,
      sequenceIndex: i,
      concept: "Percentage",
      difficulty: "Medium",
      correctIndex: 0,
    }));
    const evenResponses = new Map<string, EngineResponse>(
      evenQuestions.map((q) => resp(q.id, { selectedIndex: 0, timeSec: 60 }))
    );
    const ev = computeAnalytics(evenQuestions, evenResponses, [], 900, marking);
    expect(ev.overinvested).toHaveLength(0);
    expect(ev.selectionQuality).toBe("Strong");
    expect(ev.biggestLeak.type).toBe("none");
    expect(ev.accuracyPct).toBe(100);
    expect(ev.recoveryRatePct).toBeNull();
    expect(ev.postErrorAccuracyPct).toBeNull();
  });
});
