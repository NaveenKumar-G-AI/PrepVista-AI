import { describe, expect, it } from "vitest";
import { detectTransition, humanizeReadinessState } from "../src/engines/readinessStateMachine.js";

describe("detectTransition", () => {
  it("reports no change on the very first snapshot (nothing to compare against)", () => {
    const result = detectTransition(null, "AT_RISK");
    expect(result.changed).toBe(false);
    expect(result.explanation).toBeNull();
  });

  it("reports no change when status repeats", () => {
    expect(detectTransition("AT_RISK", "AT_RISK").changed).toBe(false);
  });

  it("gives a richer explanation for a notable transition (spec section 41)", () => {
    const result = detectTransition("AT_RISK", "IMPROVING");
    expect(result.changed).toBe(true);
    expect(result.explanation).toMatch(/improvement/i);
  });

  it("gives a richer, still-honest explanation for a regression transition without asserting an unproven cause", () => {
    const result = detectTransition("ON_TRACK", "AT_RISK");
    expect(result.changed).toBe(true);
    expect(result.explanation).not.toMatch(/you failed|your fault|you did/i);
  });

  it("falls back to a plain factual message for an unlisted transition pair", () => {
    const result = detectTransition("STABLE", "DEVELOPING");
    expect(result.changed).toBe(true);
    expect(result.explanation).toContain(humanizeReadinessState("STABLE"));
    expect(result.explanation).toContain(humanizeReadinessState("DEVELOPING"));
  });
});
