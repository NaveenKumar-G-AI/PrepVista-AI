import { describe, expect, it } from "vitest";
import { applyAdaptation } from "../src/engines/sessionAdapter";
import { decideNextDifficulty } from "../src/engines/difficultyEngine";
import { Difficulty, DifficultyDimension, ErrorCategory, MasteryState, PracticeMode, PracticeObjective, RelativeSpeed, SessionStatus } from "../src/domain/enums";
import { Attempt, PracticeSession } from "../src/domain/types";

function makeSession(): PracticeSession {
  return {
    id: "sess1",
    studentId: "s1",
    mode: PracticeMode.MASTERY_BUILDER,
    objective: PracticeObjective.IMPROVE_ACCURACY,
    objectiveReason: "test",
    skillFocus: ["SK_TEST"],
    plan: [],
    planIndex: 0,
    questionsServed: ["q1", "q2", "q3"],
    attempts: [],
    currentDifficulty: Difficulty.HARD,
    status: SessionStatus.IN_PROGRESS,
    startedAt: new Date().toISOString(),
    completedAt: null,
    adaptationLog: [],
    currentQuestionServedAt: new Date().toISOString(),
    currentQuestionHintsUsed: 0,
  };
}

function makeAttempt(overrides: Partial<Attempt>): Attempt {
  return {
    id: "a1",
    studentId: "s1",
    sessionId: "sess1",
    questionId: "q3",
    skillId: "SK_TEST",
    selectedOptionId: "opt1",
    isCorrect: false,
    timeToStartMs: 500,
    totalTimeMs: 50_000,
    expectedTimeMs: 60_000,
    relativeSpeed: RelativeSpeed.ON_PACE,
    hintsUsed: 0,
    confidence: null,
    errorCategory: ErrorCategory.CALCULATION_ERROR,
    performanceInterpretation: null,
    difficultyAtAttempt: { level: Difficulty.HARD, conceptComplexity: 4, reasoningComplexity: 3, calculationComplexity: 4, timePressure: 3, distractorQuality: 4, transferDifficulty: 3 },
    questionIndexInSession: 3,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("sessionAdapter.applyAdaptation", () => {
  it("logs a visible adaptation event for a calculation-error miss and updates session state", () => {
    const session = makeSession();
    const attempt = makeAttempt({});
    const decision = decideNextDifficulty(Difficulty.HARD, attempt, []);

    const event = applyAdaptation(session, decision, attempt);

    expect(event).not.toBeNull();
    expect(session.currentDifficulty).toBe(decision.nextDifficulty);
    expect(session.currentFocusDimension).toBe(DifficultyDimension.CALCULATION);
    expect(session.adaptationLog.length).toBe(1);
    expect(event!.previousDifficulty).toBe(Difficulty.HARD);
    expect(event!.newDifficulty).toBeLessThan(Difficulty.HARD);
  });

  it("does not log an adaptation event when correct-but-slow simply holds difficulty", () => {
    const session = makeSession();
    const attempt = makeAttempt({ isCorrect: true, errorCategory: null, relativeSpeed: RelativeSpeed.SLOW, totalTimeMs: 90_000 });
    const decision = decideNextDifficulty(Difficulty.HARD, attempt, []);

    const event = applyAdaptation(session, decision, attempt);

    expect(event).toBeNull();
    expect(session.adaptationLog.length).toBe(0);
    expect(session.currentDifficulty).toBe(Difficulty.HARD); // unchanged
  });

  it("accumulates multiple adaptation events across a session rather than overwriting", () => {
    const session = makeSession();
    const d1 = decideNextDifficulty(session.currentDifficulty, makeAttempt({}), []);
    applyAdaptation(session, d1, makeAttempt({}));
    const d2 = decideNextDifficulty(session.currentDifficulty, makeAttempt({ errorCategory: ErrorCategory.CONCEPT_GAP }), []);
    applyAdaptation(session, d2, makeAttempt({ errorCategory: ErrorCategory.CONCEPT_GAP, questionIndexInSession: 4 }));

    expect(session.adaptationLog.length).toBe(2);
  });
});
