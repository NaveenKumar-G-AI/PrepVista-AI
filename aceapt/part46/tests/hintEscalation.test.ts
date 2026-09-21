import { describe, expect, it } from "vitest";
import { buildHint } from "../src/domain/hintEscalation";

const ctx = { base: 500, percent: 20, changeAmount: 100, contextNoun: "price" };

describe("hint ladder", () => {
  it("returns nothing at level 0 (question only)", () => {
    expect(buildHint(0, ctx)).toBe("");
  });

  it("gives progressively more specific content as the level increases", () => {
    const level1 = buildHint(1, ctx);
    const level4 = buildHint(4, ctx);
    const level6 = buildHint(6, ctx);
    expect(level1.length).toBeGreaterThan(0);
    expect(level4).toContain("100"); // the actual change amount appears once we're this specific
    expect(level6).toContain("20.0%"); // level 6 is the fully worked explanation
  });

  it("never reveals the specific numbers before level 4", () => {
    expect(buildHint(1, ctx)).not.toContain("500");
    expect(buildHint(2, ctx)).not.toContain("500");
    expect(buildHint(3, ctx)).not.toContain("500");
  });
});
