import { describe, expect, it } from "vitest";
import { evaluateStoppingCondition, selectNextQuestion } from "@/lib/domain/selectionEngine";
import { computeCapabilityState } from "@/lib/domain/capabilityState";
import { SKILLS } from "@/data/seed/skills";
import { QUESTIONS } from "@/data/seed/questions";
import type { Question } from "@/lib/domain/types";
import { makeAttempt } from "./helpers/fixtures";

function toQuestions(): Question[] {
  return QUESTIONS.map((q) => ({
    ...q,
    validationStatus: "VALIDATED" as const,
    validationNotes: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  }));
}

const allQuestions = toQuestions();

describe("selectNextQuestion", () => {
  it("selects a FOUNDATION, low-difficulty, BASELINE question on an empty state", () => {
    const state = computeCapabilityState("sess_1", [], SKILLS);
    const result = selectNextQuestion(state, allQuestions, SKILLS);
    expect(result).not.toBeNull();
    expect(result!.purpose).toBe("BASELINE");
    expect(result!.question.applicationType).toBe("FOUNDATION");
    expect(result!.question.difficulty).toBeLessThanOrEqual(2);
  });

  it("prioritizes VERIFICATION for a skill with an unresolved incorrect answer over untouched skills", () => {
    const history = [
      makeAttempt({ questionId: "Q_NS_1", skillNodeId: "Q_NS", applicationType: "FOUNDATION", difficulty: 1, purpose: "BASELINE", correct: false, sequenceIndex: 0 }),
    ];
    const state = computeCapabilityState("sess_1", history, SKILLS);
    const result = selectNextQuestion(state, allQuestions, SKILLS);
    expect(result!.purpose).toBe("VERIFICATION");
    expect(result!.question.skillNodeId).toBe("Q_NS");
  });

  it("prioritizes PREREQUISITE_CHECK for the prerequisite once application evidence is weak and it's never been touched", () => {
    const history = [
      makeAttempt({ questionId: "Q_PNL_3", skillNodeId: "Q_PNL", applicationType: "APPLICATION", difficulty: 3, purpose: "COVERAGE", correct: false, sequenceIndex: 0 }),
      makeAttempt({ questionId: "Q_PNL_4", skillNodeId: "Q_PNL", applicationType: "APPLICATION", difficulty: 3, purpose: "VERIFICATION", correct: false, sequenceIndex: 1 }),
    ];
    const state = computeCapabilityState("sess_1", history, SKILLS);
    const result = selectNextQuestion(state, allQuestions, SKILLS);
    expect(result!.purpose).toBe("PREREQUISITE_CHECK");
    expect(result!.question.skillNodeId).toBe("Q_PCT_A");
  });

  it("escalates difficulty after a correct answer in the same skill", () => {
    const history = [
      makeAttempt({ questionId: "Q_NS_1", skillNodeId: "Q_NS", applicationType: "FOUNDATION", difficulty: 1, purpose: "BASELINE", correct: true, sequenceIndex: 0 }),
    ];
    const state = computeCapabilityState("sess_1", history, SKILLS);
    const nsOnly = allQuestions.filter((q) => q.skillNodeId === "Q_NS" && q.id !== "Q_NS_1");
    const result = selectNextQuestion(state, nsOnly, SKILLS);
    expect(result!.question.difficulty).toBeGreaterThanOrEqual(2);
    expect(result!.purpose).toBe("DIFFICULTY_ESCALATION");
  });

  it("never re-selects an already-asked question", () => {
    const history = [
      makeAttempt({ questionId: "Q_NS_1", skillNodeId: "Q_NS", applicationType: "FOUNDATION", difficulty: 1, purpose: "BASELINE", correct: true, sequenceIndex: 0 }),
    ];
    const state = computeCapabilityState("sess_1", history, SKILLS);
    const onlyAsked = allQuestions.filter((q) => q.id === "Q_NS_1");
    expect(selectNextQuestion(state, onlyAsked, SKILLS)).toBeNull();
  });

  it("is deterministic: identical state and candidates always produce the same pick", () => {
    const state = computeCapabilityState("sess_1", [], SKILLS);
    const first = selectNextQuestion(state, allQuestions, SKILLS);
    const second = selectNextQuestion(state, allQuestions, SKILLS);
    expect(first?.question.id).toBe(second?.question.id);
  });
});

describe("evaluateStoppingCondition", () => {
  it("does not stop before the minimum question count, even with full domain coverage", () => {
    const history = [
      makeAttempt({ questionId: "q1", skillNodeId: "Q_NS", applicationType: "FOUNDATION", difficulty: 1, purpose: "BASELINE", correct: true, sequenceIndex: 0 }),
      makeAttempt({ questionId: "q2", skillNodeId: "Q_PCT_F", applicationType: "FOUNDATION", difficulty: 1, purpose: "BASELINE", correct: true, sequenceIndex: 1 }),
      makeAttempt({ questionId: "q3", skillNodeId: "L_SEQ", applicationType: "FOUNDATION", difficulty: 1, purpose: "BASELINE", correct: true, sequenceIndex: 2 }),
      makeAttempt({ questionId: "q4", skillNodeId: "L_BR", applicationType: "FOUNDATION", difficulty: 1, purpose: "BASELINE", correct: true, sequenceIndex: 3 }),
      makeAttempt({ questionId: "q5", skillNodeId: "V_VOC", applicationType: "FOUNDATION", difficulty: 1, purpose: "BASELINE", correct: true, sequenceIndex: 4 }),
      makeAttempt({ questionId: "q6", skillNodeId: "V_GRAM", applicationType: "FOUNDATION", difficulty: 2, purpose: "BASELINE", correct: true, sequenceIndex: 5 }),
    ];
    const state = computeCapabilityState("sess_1", history, SKILLS);
    const decision = evaluateStoppingCondition(state, SKILLS, QUESTIONS.length);
    expect(decision.stop).toBe(false);
  });

  it("stops once minimum reached, all domains have real coverage, and no follow-ups remain", () => {
    // 7 skills x 2 correct attempts = 14, meeting MIN_QUESTIONS exactly,
    // with 3 quant / 2 logical / 2 verbal skills touched (>= 2 per domain).
    const skillsInOrder = ["Q_NS", "Q_PCT_F", "Q_RP_F", "L_SEQ", "L_BR", "V_VOC", "V_GRAM"];
    const history = skillsInOrder.flatMap((skillId, i) => [
      makeAttempt({ questionId: `${skillId}_a`, skillNodeId: skillId, applicationType: "FOUNDATION", difficulty: 1, purpose: "BASELINE", correct: true, sequenceIndex: i * 2 }),
      makeAttempt({ questionId: `${skillId}_b`, skillNodeId: skillId, applicationType: "FOUNDATION", difficulty: 2, purpose: "DIFFICULTY_ESCALATION", correct: true, sequenceIndex: i * 2 + 1 }),
    ]);
    const state = computeCapabilityState("sess_1", history, SKILLS);
    expect(state.questionsAttempted).toBeGreaterThanOrEqual(14);
    const decision = evaluateStoppingCondition(state, SKILLS, QUESTIONS.length);
    expect(decision.stop).toBe(true);
  });

  it("stops at the hard maximum regardless of coverage", () => {
    const history = Array.from({ length: 28 }, (_, i) =>
      makeAttempt({ questionId: `q${i}`, skillNodeId: "Q_NS", applicationType: "FOUNDATION", difficulty: 1, purpose: "BASELINE", correct: true, sequenceIndex: i })
    );
    const state = computeCapabilityState("sess_1", history, SKILLS);
    const decision = evaluateStoppingCondition(state, SKILLS, QUESTIONS.length);
    expect(decision.stop).toBe(true);
    expect(decision.reason).toMatch(/maximum/i);
  });
});
