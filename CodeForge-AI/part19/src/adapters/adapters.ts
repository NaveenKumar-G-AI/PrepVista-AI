import type { AstFacts } from "../analysis/astAnalyzer.js";
import type { DetectedPattern } from "../analysis/patternDetector.js";
import { estimateComplexity, type ComplexityEstimate } from "../analysis/complexityEstimator.js";

// ─────────────────────────────────────────────────────────────────────────
// ComplexityAnalyzerAdapter
// The spec is explicit: "Consume the trusted complexity result already
// produced by CodeForge's complexity analysis system. Do not rebuild that
// analyzer here." Implement this interface against your real analyzer and
// pass it into the pipeline; DefaultComplexityAnalyzerAdapter (the built-in
// heuristic from analysis/complexityEstimator.ts) is only a fallback so the
// engine runs standalone.
// ─────────────────────────────────────────────────────────────────────────

export interface ComplexityAnalyzerAdapter {
  readonly name: string;
  analyze(input: { sourceCode: string; facts: AstFacts; patterns: DetectedPattern[] }): Promise<ComplexityEstimate>;
}

export class DefaultComplexityAnalyzerAdapter implements ComplexityAnalyzerAdapter {
  readonly name = "built-in-heuristic";
  async analyze(input: { sourceCode: string; facts: AstFacts; patterns: DetectedPattern[] }): Promise<ComplexityEstimate> {
    return estimateComplexity(input.facts, input.patterns);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// ExecutionAdapter
// Deliberately ships with NO default/mock execution implementation. The
// spec is explicit: "Do not bypass existing sandbox security" and "Use the
// existing sandbox/execution infrastructure" — a naive eval()-based runner
// here would be exactly the kind of unsafe shortcut that instruction rules
// out. Edge-case verification runs on static guard-clause evidence alone
// until you wire this to your real sandbox; see
// verification/verifiers.ts::verifyEdgeCaseClaim.
// ─────────────────────────────────────────────────────────────────────────

export interface ExecutionResult {
  ok: boolean;
  output?: unknown;
  error?: string;
  threw: boolean;
}

export interface ExecutionAdapter {
  readonly name: string;
  run(input: { sourceCode: string; functionName: string | null; args: unknown[] }): Promise<ExecutionResult>;
}

// ─────────────────────────────────────────────────────────────────────────
// CodeQualityAdapter — optional; only consumed if supplied. Lets a
// CORRECTNESS or IMPLEMENTATION_DECISION claim be cross-checked against an
// existing code-quality signal (e.g. "readable" claims vs a lint/complexity
// score) without this module re-implementing a quality analyzer.
// ─────────────────────────────────────────────────────────────────────────

export interface CodeQualitySignal {
  metric: string;
  value: number;
  note?: string;
}

export interface CodeQualityAdapter {
  readonly name: string;
  getSignals(input: { sourceCode: string }): Promise<CodeQualitySignal[]>;
}
