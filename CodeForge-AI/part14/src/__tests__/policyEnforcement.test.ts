import { describe, it, expect } from "vitest";
import { isResponseTypeAllowed, nextCoachingDepth } from "../security/policyEnforcement";

describe("policyEnforcement", () => {
  it("blocks SOLUTION_ASSISTANCE in assessment and interview modes", () => {
    expect(isResponseTypeAllowed("assessment", "SOLUTION_ASSISTANCE")).toBe(false);
    expect(isResponseTypeAllowed("interview", "SOLUTION_ASSISTANCE")).toBe(false);
  });

  it("allows SOLUTION_ASSISTANCE only in practice mode", () => {
    expect(isResponseTypeAllowed("practice", "SOLUTION_ASSISTANCE")).toBe(true);
  });

  it("resets depth to 1 once an issue resolves, otherwise advances it up to a cap of 5", () => {
    expect(nextCoachingDepth(3, true)).toBe(1);
    expect(nextCoachingDepth(3, false)).toBe(4);
    expect(nextCoachingDepth(5, false)).toBe(5);
  });
});
