import type { ComparatorContext, DimensionResult } from "../../types";
import { makeFinding, scoreFromAlignment, unknownResult } from "../scoring";
import { checkSemanticEquivalence } from "../../ai/semanticEquivalence";

interface PatternSignature {
  name: string;
  requiredSignals: string[];
  keywords: string[];
}

// Recognize common patterns from structural signals (from your static
// analysis) and from free-text keywords (from the student's claim). This is
// intentionally a small, extensible registry — add your own repo-specific
// patterns here rather than special-casing them elsewhere.
const PATTERNS: PatternSignature[] = [
  { name: "sliding_window", requiredSignals: ["twoPointers", "windowBoundaryAdjustment"], keywords: ["sliding window", "window", "expand", "shrink", "left pointer", "right pointer", "boundary"] },
  { name: "two_pointer", requiredSignals: ["twoPointers"], keywords: ["two pointer", "two-pointer", "left and right pointer"] },
  { name: "dynamic_programming", requiredSignals: ["memoTable"], keywords: ["dynamic programming", " dp ", "memo", "subproblem"] },
  { name: "recursion", requiredSignals: ["recursiveCall"], keywords: ["recursion", "recursive", "recurse"] },
  { name: "graph_traversal", requiredSignals: ["visitedSet", "adjacencyTraversal"], keywords: ["bfs", "dfs", "graph traversal", "visited"] },
  { name: "backtracking", requiredSignals: ["recursiveCall", "stateUndo"], keywords: ["backtrack", "undo", "revert"] },
  { name: "binary_search", requiredSignals: ["sortedBoundaryNarrowing"], keywords: ["binary search", "midpoint", "mid point", "narrow the range"] },
];

function detectImplementationPatterns(signals: string[]): string[] {
  const set = new Set(signals);
  return PATTERNS.filter((p) => p.requiredSignals.every((s) => set.has(s))).map((p) => p.name);
}

function detectClaimedPatterns(text: string): string[] {
  const t = ` ${text.toLowerCase()} `;
  return PATTERNS.filter((p) => p.keywords.some((k) => t.includes(k))).map((p) => p.name);
}

export async function compareAlgorithm(ctx: ComparatorContext): Promise<DimensionResult> {
  const dim = "ALGORITHM_ALIGNMENT" as const;
  const claimText = ctx.studentModel.algorithmClaimText;
  if (!claimText.trim()) return unknownResult(dim, "Student gave no algorithm description.");
  if (ctx.implementationModel.detectedPatternSignals.length === 0) {
    return unknownResult(dim, "No static-analysis signals were available to detect the implementation's algorithmic pattern.");
  }

  const implPatterns = detectImplementationPatterns(ctx.implementationModel.detectedPatternSignals);
  const claimedPatterns = detectClaimedPatterns(claimText);

  if (claimedPatterns.length > 0 && implPatterns.length > 0) {
    const overlap = claimedPatterns.filter((p) => implPatterns.includes(p));
    if (overlap.length > 0) {
      return { dimension: dim, alignment: "MATCH", score: 100, confidence: 0.85, evidenceStrength: "STRONG", findings: [] };
    }
    const confidence = 0.8;
    const finding = makeFinding({
      dimension: dim,
      severity: "HIGH",
      evidenceStrength: "STRONG",
      confidence,
      summary: `You described your approach as ${humanize(claimedPatterns)}, but the implementation's structure matches ${humanize(implPatterns)} instead.`,
      studentClaim: claimText,
    });
    return { dimension: dim, alignment: "MISMATCH", score: scoreFromAlignment("MISMATCH", confidence), confidence, evidenceStrength: "STRONG", findings: [finding] };
  }

  if (implPatterns.length > 0) {
    // Claim didn't hit a keyword pattern — fall back to AI semantic equivalence (or deterministic overlap if no AI configured).
    const facts = implPatterns.map((p) => `the implementation structurally matches a ${p.replace(/_/g, " ")} pattern`);
    const eq = await checkSemanticEquivalence({ claimText, candidateFacts: facts, aiProvider: ctx.aiProvider });
    if (eq.verdict === "AI_UNAVAILABLE") {
      return unknownResult(dim, "Algorithm description was too ambiguous to classify automatically, and no AI provider is configured to interpret it.");
    }
    const alignment = eq.verdict === "YES" ? "MATCH" : eq.verdict === "PARTIAL" ? "PARTIAL" : "MISMATCH";
    const confidence = eq.source === "ai" ? 0.7 : 0.4;
    const findings =
      alignment === "MATCH"
        ? []
        : [
            makeFinding({
              dimension: dim,
              severity: alignment === "MISMATCH" ? "HIGH" : "MEDIUM",
              evidenceStrength: eq.source === "ai" ? "MODERATE" : "WEAK",
              confidence,
              summary: `Your algorithm description doesn't clearly match the detected implementation pattern (${humanize(implPatterns)}).`,
              studentClaim: claimText,
            }),
          ];
    return { dimension: dim, alignment, score: scoreFromAlignment(alignment, confidence), confidence, evidenceStrength: eq.source === "ai" ? "MODERATE" : "WEAK", findings };
  }

  return unknownResult(dim, "Could not confidently classify either the claimed or implemented algorithmic pattern.");
}

function humanize(patterns: string[]): string {
  return patterns.map((p) => p.replace(/_/g, " ")).join(" / ");
}
