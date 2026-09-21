import { describe, it, expect } from "vitest";
import { compareOutputs } from "../../lib/engine/comparators";

describe("compareOutputs: exact", () => {
  it("matches identical strings", () => {
    expect(compareOutputs("42\n", "42\n", { kind: "exact" }).matches).toBe(true);
  });
  it("rejects trailing whitespace differences", () => {
    expect(compareOutputs("42\n", "42 \n", { kind: "exact" }).matches).toBe(false);
  });
});

describe("compareOutputs: whitespace_normalized", () => {
  it("ignores trailing spaces and surrounding blank lines", () => {
    const r = compareOutputs("  2  \n\n", "2", { kind: "whitespace_normalized" });
    expect(r.matches).toBe(true);
  });
  it("still distinguishes different content", () => {
    const r = compareOutputs("2\n", "3\n", { kind: "whitespace_normalized" });
    expect(r.matches).toBe(false);
  });
});

describe("compareOutputs: numeric_tolerance", () => {
  it("accepts values within absolute tolerance", () => {
    const r = compareOutputs("3.14159", "3.14160", {
      kind: "numeric_tolerance",
      absTolerance: 1e-3,
      relTolerance: 0,
    });
    expect(r.matches).toBe(true);
  });
  it("rejects values outside tolerance", () => {
    const r = compareOutputs("3.14159", "3.2", {
      kind: "numeric_tolerance",
      absTolerance: 1e-6,
      relTolerance: 1e-9,
    });
    expect(r.matches).toBe(false);
  });
  it("accepts mathematically-equivalent integer/float forms", () => {
    const r = compareOutputs("2", "2.0", { kind: "numeric_tolerance", absTolerance: 1e-9, relTolerance: 0 });
    expect(r.matches).toBe(true);
  });
  it("still requires non-numeric tokens to match exactly", () => {
    const r = compareOutputs("yes 1.0", "no 1.0", { kind: "numeric_tolerance" });
    expect(r.matches).toBe(false);
  });
  it("rejects mismatched token counts", () => {
    const r = compareOutputs("1 2 3", "1 2", { kind: "numeric_tolerance" });
    expect(r.matches).toBe(false);
  });
});

describe("compareOutputs: structured", () => {
  it("matches regardless of line order", () => {
    const r = compareOutputs("b\na\nc", "a\nb\nc", { kind: "structured" });
    expect(r.matches).toBe(true);
  });
  it("rejects when the multiset of lines differs", () => {
    const r = compareOutputs("a\nb\nc", "a\nb\nd", { kind: "structured" });
    expect(r.matches).toBe(false);
  });
});

describe("compareOutputs: custom checker routing", () => {
  it("throws rather than silently falling back — custom checkers must go through runCustomChecker", () => {
    expect(() => compareOutputs("x", "y", { kind: "custom" })).toThrow();
  });
});
