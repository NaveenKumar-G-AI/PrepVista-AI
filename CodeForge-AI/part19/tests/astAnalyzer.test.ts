import { describe, it, expect } from "vitest";
import { analyzeSource } from "../src/analysis/astAnalyzer.js";
import { TWO_SUM_HASHMAP, PAIR_SUM_NESTED, BINARY_SEARCH, FIB_MEMOIZED, EMPTY_GUARD_EXAMPLE } from "./fixtures.js";

describe("analyzeSource", () => {
  it("returns a typed failure for unparsable source instead of throwing", () => {
    const result = analyzeSource("function( this is not valid js {{{");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("PARSER_FAILURE");
  });

  it("returns a typed failure for empty source", () => {
    const result = analyzeSource("   ");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("PARSER_FAILURE");
  });

  it("detects single-pass loop depth and Map usage in the hashmap two-sum solution", () => {
    const result = analyzeSource(TWO_SUM_HASHMAP);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.maxLoopDepth).toBe(1);
    const map = result.value.dataStructures.find((d) => d.kind === "Map");
    expect(map).toBeDefined();
    expect(map!.operations).toEqual(expect.arrayContaining(["has", "get", "set"]));
  });

  it("detects nested loop depth 2 in the brute-force pair-sum solution", () => {
    const result = analyzeSource(PAIR_SUM_NESTED);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.maxLoopDepth).toBe(2);
  });

  it("finds no more than the loops actually present (no phantom nesting)", () => {
    const result = analyzeSource(BINARY_SEARCH);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.maxLoopDepth).toBe(1);
  });

  it("flags recursion and a memoization signal for the memoized fibonacci fixture", () => {
    const result = analyzeSource(FIB_MEMOIZED);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const fn = result.value.functions.find((f) => f.name === "fib");
    expect(fn?.isRecursive).toBe(true);
    expect(fn?.hasMemoizationSignal).toBe(true);
  });

  it("detects an explicit empty-input guard clause", () => {
    const result = analyzeSource(EMPTY_GUARD_EXAMPLE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.emptyGuardLocations.length).toBeGreaterThan(0);
  });
});
