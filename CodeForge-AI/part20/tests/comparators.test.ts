import { describe, it, expect } from "vitest";
import { compareComplexity } from "../src/engine/dimensionComparators/complexity";
import { compareSpace } from "../src/engine/dimensionComparators/space";

describe("compareComplexity", () => {
  it("matches when claimed equals trusted", () => {
    const r = compareComplexity({ claimed: { time: "O(n)" }, trusted: { time: "O(n)" } });
    expect(r.alignment).toBe("MATCH");
    expect(r.findings).toHaveLength(0);
  });

  it("flags a CRITICAL mismatch when the student understates complexity by 2+ ranks", () => {
    const r = compareComplexity({ claimed: { time: "O(n)" }, trusted: { time: "O(n^2)" } });
    expect(r.alignment).toBe("MISMATCH");
    expect(r.findings[0].severity).toBe("CRITICAL");
  });

  it("flags HIGH (not CRITICAL) when the student overstates complexity by 2+ ranks", () => {
    const r = compareComplexity({ claimed: { time: "O(n^2)" }, trusted: { time: "O(n)" } });
    expect(r.alignment).toBe("MISMATCH");
    expect(r.findings[0].severity).toBe("HIGH");
  });

  it("treats an adjacent-rank gap as PARTIAL rather than MISMATCH", () => {
    const r = compareComplexity({ claimed: { time: "O(n log n)" }, trusted: { time: "O(n)" } });
    expect(r.alignment).toBe("PARTIAL");
  });

  it("returns UNKNOWN when there's no trusted complexity to compare against", () => {
    const r = compareComplexity({ claimed: { time: "O(n)" }, trusted: undefined });
    expect(r.alignment).toBe("UNKNOWN");
    expect(r.score).toBeNull();
  });

  it("understands common synonyms like 'linear' and 'constant'", () => {
    const r = compareComplexity({ claimed: { time: "linear" }, trusted: { time: "O(n)" } });
    expect(r.alignment).toBe("MATCH");
  });
});

describe("compareSpace", () => {
  it("flags a mismatch when student claims constant space but a structure grows with input", () => {
    const r = compareSpace({ claimedConstant: true, dataStructures: [{ name: "seen", type: "set", growsWithInput: true }] });
    expect(r.alignment).toBe("MISMATCH");
    expect(r.findings[0].summary).toContain("seen");
  });

  it("matches when student claims constant space and nothing grows", () => {
    const r = compareSpace({ claimedConstant: true, dataStructures: [{ name: "nums", type: "array", growsWithInput: false }] });
    expect(r.alignment).toBe("MATCH");
  });

  it("returns UNKNOWN when there is no space claim at all", () => {
    const r = compareSpace({ claimedConstant: false, dataStructures: [] });
    expect(r.alignment).toBe("UNKNOWN");
  });
});
