import { describe, it, expect } from "vitest";
import { isRepeatHint } from "../engine/antiRepetition";

describe("antiRepetition", () => {
  it("detects a near-duplicate hint", () => {
    const previous = ["Check the loop boundary at the final index."];
    expect(isRepeatHint("Look again at the loop boundary at the final index.", previous)).toBe(true);
  });

  it("allows a genuinely new hint about a different concept", () => {
    const previous = ["Check the loop boundary at the final index."];
    expect(isRepeatHint("Look at how you initialize the accumulator variable before the loop starts.", previous)).toBe(false);
  });

  it("does not flag anything against an empty history", () => {
    expect(isRepeatHint("Any hint at all.", [])).toBe(false);
  });
});
