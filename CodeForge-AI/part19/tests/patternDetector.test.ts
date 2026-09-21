import { describe, it, expect } from "vitest";
import { analyzeSource } from "../src/analysis/astAnalyzer.js";
import { detectPatterns, normalizeAlgorithmClaim } from "../src/analysis/patternDetector.js";
import { TWO_SUM_HASHMAP, PAIR_SUM_NESTED, BINARY_SEARCH, SLIDING_WINDOW_MAX_SUM, BFS_QUEUE, FIB_MEMOIZED } from "./fixtures.js";

function facts(src: string) {
  const r = analyzeSource(src);
  if (!r.ok) throw new Error(r.message);
  return r.value;
}

describe("detectPatterns", () => {
  it("detects hashing in the two-sum hashmap solution", () => {
    const patterns = detectPatterns(facts(TWO_SUM_HASHMAP)).map((p) => p.pattern);
    expect(patterns).toContain("hashing");
  });

  it("falls back to nested-iteration for the brute-force pair-sum solution", () => {
    const patterns = detectPatterns(facts(PAIR_SUM_NESTED)).map((p) => p.pattern);
    expect(patterns).toContain("nested-iteration");
    expect(patterns).not.toContain("hashing");
  });

  it("detects binary-search from the midpoint-narrowing shape", () => {
    const patterns = detectPatterns(facts(BINARY_SEARCH)).map((p) => p.pattern);
    expect(patterns).toContain("binary-search");
  });

  it("detects sliding-window from the +=/-= running aggregate shape", () => {
    const patterns = detectPatterns(facts(SLIDING_WINDOW_MAX_SUM)).map((p) => p.pattern);
    expect(patterns).toContain("sliding-window");
  });

  it("detects bfs from the push+shift queue shape", () => {
    const patterns = detectPatterns(facts(BFS_QUEUE)).map((p) => p.pattern);
    expect(patterns).toContain("bfs");
  });

  it("detects recursion-memoized for the memoized fibonacci fixture", () => {
    const patterns = detectPatterns(facts(FIB_MEMOIZED)).map((p) => p.pattern);
    expect(patterns).toContain("recursion-memoized");
  });

  it("does not fabricate binary-search on code with no midpoint narrowing", () => {
    const patterns = detectPatterns(facts(PAIR_SUM_NESTED)).map((p) => p.pattern);
    expect(patterns).not.toContain("binary-search");
  });
});

describe("normalizeAlgorithmClaim", () => {
  it("maps varied free-text phrasing to the same canonical pattern", () => {
    expect(normalizeAlgorithmClaim("I used a hash map for O(1) lookup")).toBe("hashing");
    expect(normalizeAlgorithmClaim("dictionary-based approach")).toBe("hashing");
    expect(normalizeAlgorithmClaim("a hash table to check membership")).toBe("hashing");
  });

  it("returns null for text with no recognizable algorithm claim", () => {
    expect(normalizeAlgorithmClaim("I named my variables clearly")).toBeNull();
  });
});
