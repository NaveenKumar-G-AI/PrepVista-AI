import { describe, it, expect } from "vitest";
import { validateAiOutput } from "../src/ai/output-schema.js";
import { DebuggingActionType } from "../src/types.js";

const allowed = [DebuggingActionType.INSPECT_VARIABLE, DebuggingActionType.INSPECT_TRACE];

function validPayload(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    recommendedAction: "INSPECT_VARIABLE",
    target: "left",
    reason: "This distinguishes the two live hypotheses.",
    expectedInformationGain: "HIGH",
    coachingLevel: "QUESTION",
    question: "What do you expect `left` to be at this point, and what is it actually?",
    confidence: "HIGH",
    ...overrides,
  });
}

describe("validateAiOutput", () => {
  it("accepts a well-formed response whose action is in the allowed set", () => {
    const result = validateAiOutput(validPayload(), allowed);
    expect(result.valid).toBe(true);
    expect(result.data?.recommendedAction).toBe(DebuggingActionType.INSPECT_VARIABLE);
  });

  it("strips markdown code fences before parsing", () => {
    const fenced = "```json\n" + validPayload() + "\n```";
    const result = validateAiOutput(fenced, allowed);
    expect(result.valid).toBe(true);
  });

  it("rejects malformed JSON", () => {
    const result = validateAiOutput("{not: valid json", allowed);
    expect(result.valid).toBe(false);
    expect(result.errors?.[0]).toMatch(/not valid JSON/);
  });

  it("rejects a response missing required fields", () => {
    const missingQuestion = JSON.stringify({
      recommendedAction: "INSPECT_VARIABLE",
      reason: "x",
      expectedInformationGain: "HIGH",
      coachingLevel: "QUESTION",
      confidence: "HIGH",
    });
    const result = validateAiOutput(missingQuestion, allowed);
    expect(result.valid).toBe(false);
  });

  it("rejects an invented action name that isn't in the taxonomy at all (Section 40)", () => {
    const result = validateAiOutput(validPayload({ recommendedAction: "HACK_THE_MAINFRAME" }), allowed);
    expect(result.valid).toBe(false);
  });

  it("rejects a real, valid action that simply wasn't among the candidates actually offered", () => {
    // APPLY_FIX is a real action in the taxonomy, but not in `allowed` for this turn.
    const result = validateAiOutput(validPayload({ recommendedAction: "APPLY_FIX" }), allowed);
    expect(result.valid).toBe(false);
    expect(result.errors?.[0]).toMatch(/not among the candidates offered/);
  });

  it("rejects an invalid enum value for coachingLevel", () => {
    const result = validateAiOutput(validPayload({ coachingLevel: "GIVE_UP_AND_TELL_THEM" }), allowed);
    expect(result.valid).toBe(false);
  });
});
