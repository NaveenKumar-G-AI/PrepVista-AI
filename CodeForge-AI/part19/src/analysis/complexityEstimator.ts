import type { AstFacts } from "./astAnalyzer.js";
import type { DetectedPattern } from "./patternDetector.js";
import type { EvidenceStrength } from "../types.js";

export interface ComplexityEstimate {
  time: string;
  space: string;
  timeConfidence: EvidenceStrength;
  spaceConfidence: EvidenceStrength;
  rationale: string;
}

const WRITE_OPS = new Set(["set", "add", "push", "unshift"]);

/**
 * Heuristic default complexity estimator.
 *
 * IMPORTANT — this is a fallback, not "the" analyzer. General static
 * complexity analysis is undecidable in the general case; this function
 * approximates it from loop nesting depth, recognized algorithmic patterns,
 * and recursion facts. It exists purely so this module runs end-to-end
 * without CodeForge's real complexity analyzer attached.
 *
 * The spec is explicit: "Consume the trusted complexity result already
 * produced by CodeForge's complexity analysis system. Do not rebuild that
 * analyzer here." Wire your real analyzer in via
 * adapters.ComplexityAnalyzerAdapter and this function will not be called.
 */
export function estimateComplexity(facts: AstFacts, patterns: DetectedPattern[]): ComplexityEstimate {
  const patternNames = new Set(patterns.map((p) => p.pattern));
  const hasRecursion = facts.functions.some((f) => f.isRecursive);
  const hasMemoizedRecursion = facts.functions.some((f) => f.isRecursive && f.hasMemoizationSignal);
  const hasUnmemoizedRecursion = facts.functions.some((f) => f.isRecursive && !f.hasMemoizationSignal);

  let time: string;
  let timeConfidence: EvidenceStrength;
  let rationale: string;

  if (patternNames.has("binary-search")) {
    time = "O(log n)";
    timeConfidence = "STRONG";
    rationale = "A binary-search narrowing shape was detected — the search space halves each iteration.";
  } else if (patternNames.has("sliding-window")) {
    time = "O(n)";
    timeConfidence = "MODERATE";
    rationale = "A sliding-window shape was detected — each index advances at most n times in total across the run.";
  } else if (patternNames.has("sorting") && facts.maxLoopDepth <= 1) {
    time = "O(n log n)";
    timeConfidence = "MODERATE";
    rationale = "A .sort() call dominates, with no additional nested loop beyond it.";
  } else if (hasMemoizedRecursion) {
    time = "O(n)";
    timeConfidence = "MODERATE";
    rationale = "Recursion with a cache (has/get + set) detected — each distinct state is computed once. Exact degree depends on the state space; treated as linear in the single-parameter case.";
  } else if (hasUnmemoizedRecursion) {
    time = "O(2^n)";
    timeConfidence = "WEAK";
    rationale = "Recursion with no memoization signal detected. Branching factor and depth cannot be determined statically with confidence — this is a conservative estimate, not a proof.";
  } else if (facts.maxLoopDepth === 0) {
    time = "O(1)";
    timeConfidence = "MODERATE";
    rationale = "No loops or recursion detected.";
  } else {
    const d = facts.maxLoopDepth;
    time = d === 1 ? "O(n)" : `O(n^${d})`;
    timeConfidence = "MODERATE";
    rationale = `Maximum loop nesting depth is ${d}, with no more specific pattern (binary search, sliding window, hashing-as-single-pass) detected.`;
  }

  let space: string;
  let spaceConfidence: EvidenceStrength;

  const growsWithInput = facts.dataStructures.some((ds) => ds.operations.some((op) => WRITE_OPS.has(op)));
  if (hasUnmemoizedRecursion) {
    space = "O(n)";
    spaceConfidence = "WEAK";
  } else if (hasMemoizedRecursion) {
    space = "O(n)";
    spaceConfidence = "MODERATE";
  } else if (growsWithInput) {
    space = "O(n)";
    spaceConfidence = "MODERATE";
  } else {
    space = "O(1)";
    spaceConfidence = "MODERATE";
  }

  return { time, space, timeConfidence, spaceConfidence, rationale };
}
