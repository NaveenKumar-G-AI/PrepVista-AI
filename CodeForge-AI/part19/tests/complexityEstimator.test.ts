import { describe, it, expect } from "vitest";
import { analyzeSource } from "../src/analysis/astAnalyzer.js";
import { detectPatterns } from "../src/analysis/patternDetector.js";
import { estimateComplexity } from "../src/analysis/complexityEstimator.js";
import { TWO_SUM_HASHMAP, PAIR_SUM_NESTED, BINARY_SEARCH } from "./fixtures.js";

function estimate(src: string) {
  const r = analyzeSource(src);
  if (!r.ok) throw new Error(r.message);
  const patterns = detectPatterns(r.value);
  return estimateComplexity(r.value, patterns);
}

describe("estimateComplexity", () => {
  it("estimates O(n) time / O(n) space for the hashmap two-sum solution", () => {
    const e = estimate(TWO_SUM_HASHMAP);
    expect(e.time).toBe("O(n)");
    expect(e.space).toBe("O(n)");
  });

  it("estimates O(n^2) time for the nested-loop pair-sum solution", () => {
    const e = estimate(PAIR_SUM_NESTED);
    expect(e.time).toBe("O(n^2)");
  });

  it("estimates O(log n) time / O(1) space for binary search", () => {
    const e = estimate(BINARY_SEARCH);
    expect(e.time).toBe("O(log n)");
    expect(e.space).toBe("O(1)");
  });

  it("is deterministic — identical input produces identical output", () => {
    const a = estimate(PAIR_SUM_NESTED);
    const b = estimate(PAIR_SUM_NESTED);
    expect(a).toEqual(b);
  });
});
