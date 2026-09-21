import { describe, expect, it } from "vitest";
import { reconcileAttempts, type SimulationEventInput } from "../eventProcessor.js";

const questions = [{ questionId: "q1", correctOptionId: "a" }];

function ev(overrides: Partial<SimulationEventInput>): SimulationEventInput {
  return { questionId: "q1", eventType: "QUESTION_VIEWED", eventTimestamp: "2026-01-01T00:00:00.000Z", payload: {}, ...overrides };
}

describe("reconcileAttempts", () => {
  it("marks a question unanswered when it has no events at all", () => {
    const [result] = reconcileAttempts([], questions);
    expect(result!.finalStatus).toBe("unanswered");
    expect(result!.isCorrect).toBeNull();
  });

  it("marks a question answered and correct from a single ANSWERED event", () => {
    const events = [ev({ eventType: "QUESTION_ANSWERED", payload: { selectedOptionId: "a" } })];
    const [result] = reconcileAttempts(events, questions);
    expect(result!.finalStatus).toBe("answered");
    expect(result!.isCorrect).toBe(true);
  });

  it("uses the LAST selection when the student changes their answer", () => {
    const events = [
      ev({ eventType: "QUESTION_ANSWERED", eventTimestamp: "2026-01-01T00:00:01.000Z", payload: { selectedOptionId: "b" } }),
      ev({ eventType: "QUESTION_ANSWERED", eventTimestamp: "2026-01-01T00:00:05.000Z", payload: { selectedOptionId: "a" } }),
    ];
    const [result] = reconcileAttempts(events, questions);
    expect(result!.selectedOptionId).toBe("a");
    expect(result!.isCorrect).toBe(true);
  });

  it("is insensitive to event arrival order — reconciles the same regardless of input order", () => {
    const inOrder: SimulationEventInput[] = [
      ev({ eventType: "QUESTION_ANSWERED", eventTimestamp: "2026-01-01T00:00:01.000Z", payload: { selectedOptionId: "b" } }),
      ev({ eventType: "QUESTION_ANSWERED", eventTimestamp: "2026-01-01T00:00:05.000Z", payload: { selectedOptionId: "a" } }),
    ];
    const reversed = [...inOrder].reverse();
    const a = reconcileAttempts(inOrder, questions)[0];
    const b = reconcileAttempts(reversed, questions)[0];
    expect(a).toEqual(b);
  });

  it("distinguishes an explicit skip (never answered) from a passively unanswered question", () => {
    const skipped = reconcileAttempts([ev({ eventType: "QUESTION_SKIPPED" })], questions)[0];
    const neverTouched = reconcileAttempts([], questions)[0];
    expect(skipped!.finalStatus).toBe("skipped");
    expect(neverTouched!.finalStatus).toBe("unanswered");
  });

  it("sums timeSpentDeltaSeconds across all events for a question", () => {
    const events = [
      ev({ eventType: "QUESTION_VIEWED", payload: { timeSpentDeltaSeconds: 5 } }),
      ev({ eventType: "QUESTION_ANSWERED", payload: { selectedOptionId: "a", timeSpentDeltaSeconds: 20 } }),
    ];
    const [result] = reconcileAttempts(events, questions);
    expect(result!.timeSpentSeconds).toBe(25);
  });

  it("counts revisit events correctly", () => {
    const events = [ev({ eventType: "QUESTION_REVISITED" }), ev({ eventType: "QUESTION_REVISITED" }), ev({ eventType: "QUESTION_ANSWERED", payload: { selectedOptionId: "a" } })];
    const [result] = reconcileAttempts(events, questions);
    expect(result!.revisitCount).toBe(2);
  });

  it("ignores events for a question that is not part of this simulation", () => {
    const events = [ev({ questionId: "not-in-sim", eventType: "QUESTION_ANSWERED", payload: { selectedOptionId: "a" } })];
    const [result] = reconcileAttempts(events, questions);
    expect(result!.finalStatus).toBe("unanswered"); // q1 itself untouched
  });

  it("marks an answer incorrect when the selected option doesn't match the answer key", () => {
    const events = [ev({ eventType: "QUESTION_ANSWERED", payload: { selectedOptionId: "z" } })];
    const [result] = reconcileAttempts(events, questions);
    expect(result!.isCorrect).toBe(false);
  });
});
