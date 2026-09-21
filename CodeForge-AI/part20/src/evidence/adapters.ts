// THIS FILE IS THE INTEGRATION SEAM.
//
// The consistency engine never touches a database, execution sandbox, AST
// parser, or reasoning-verification system directly — it only calls the
// methods below. In your real CodeForge repo, implement each one by
// delegating to the systems that already exist there (execution engine,
// complexity analyzer, reasoning verification, static/AST analysis).
//
// Keeping this the single seam is what makes "never fabricate evidence"
// enforceable: if a method can't produce real evidence, it should return
// null / an empty array rather than inventing something. Every comparator in
// this engine is written to degrade gracefully (UNKNOWN / INSUFFICIENT_EVIDENCE)
// when a field here is empty, rather than guessing.

import type { Evidence, ProblemModel, RawReasoningClaim } from "../types";

export interface StaticAnalysisBundle {
  /** Structural signals your AST/control-flow analysis detected, e.g. "twoPointers", "recursiveCall", "memoTable". */
  detectedPatternSignals: string[];
  dataStructures: { name: string; type: string; growsWithInput: boolean }[];
  /** Per-variable facts derived from AST/execution analysis, e.g. left -> ["advanced only when nums[left]===nums[left-1]"]. */
  variableFacts: { variable: string; facts: string[] }[];
}

export interface ExecutionEvidenceBundle {
  summary: { allVisibleTestsPassed: boolean; allHiddenTestsPassed?: boolean };
  edgeCaseOutcomes: { case: string; actualOutcome: string }[];
}

export interface TrustedComplexityResult {
  time: string;
  space?: string;
  evidence?: Evidence[];
}

export interface EvidenceAdapters {
  getProblemContext(problemId: string): Promise<ProblemModel>;
  /** Should return claims already extracted by your existing reasoning-verification system. */
  getRawReasoningClaims(submissionId: string): Promise<RawReasoningClaim[]>;
  getStaticAnalysis(submissionId: string): Promise<StaticAnalysisBundle>;
  /** Return null (not an empty object) when execution evidence genuinely isn't available — the engine degrades gracefully. */
  getExecutionEvidence(submissionId: string): Promise<ExecutionEvidenceBundle | null>;
  /** Return null when your existing complexity analyzer has no trusted result for this submission. */
  getTrustedComplexity(submissionId: string): Promise<TrustedComplexityResult | null>;
}

/** Throws clearly instead of silently returning fake data — use this as a placeholder until you wire in the real adapters. */
export function createUnimplementedAdapters(): EvidenceAdapters {
  const notImplemented = (name: string) => {
    return async (): Promise<never> => {
      throw new Error(`EvidenceAdapters.${name} is not wired up yet. Implement it against your existing CodeForge systems (see README.md).`);
    };
  };
  return {
    getProblemContext: notImplemented("getProblemContext") as EvidenceAdapters["getProblemContext"],
    getRawReasoningClaims: notImplemented("getRawReasoningClaims") as EvidenceAdapters["getRawReasoningClaims"],
    getStaticAnalysis: notImplemented("getStaticAnalysis") as EvidenceAdapters["getStaticAnalysis"],
    getExecutionEvidence: notImplemented("getExecutionEvidence") as EvidenceAdapters["getExecutionEvidence"],
    getTrustedComplexity: notImplemented("getTrustedComplexity") as EvidenceAdapters["getTrustedComplexity"],
  };
}
