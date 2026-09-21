export * from "./types.js";
export { runReasoningVerification, reVerifyWithFollowUp } from "./pipeline.js";
export type { ReasoningAdapters, RunReasoningVerificationInput, ReVerifyWithFollowUpInput } from "./pipeline.js";

export { analyzeSource } from "./analysis/astAnalyzer.js";
export type { AstFacts, LoopFact, DataStructureUsage, CallSite, FunctionFact } from "./analysis/astAnalyzer.js";
export { detectPatterns, normalizeAlgorithmClaim, CANONICAL_PATTERNS } from "./analysis/patternDetector.js";
export type { DetectedPattern, CanonicalPattern } from "./analysis/patternDetector.js";
export { estimateComplexity } from "./analysis/complexityEstimator.js";
export type { ComplexityEstimate } from "./analysis/complexityEstimator.js";

export { extractClaims, extractClaimsRuleBased } from "./claims/claimExtractor.js";

export { MockAIProvider } from "./ai/provider.js";
export type { AIProvider, AIResult } from "./ai/provider.js";
export { GroqProvider, GeminiProvider } from "./ai/groqGeminiProviders.js";
export { scanForInjectionAttempt, wrapUntrustedText } from "./ai/promptInjectionGuard.js";

export { runVerification } from "./verification/verificationEngine.js";
export { detectContradictions } from "./verification/contradictionDetector.js";

export { computeScore, DEFAULT_SCORING_CONFIG } from "./scoring/scorer.js";
export type { ScoringConfig } from "./scoring/scorer.js";

export { generateFollowUpQuestions } from "./followup/questionGenerator.js";
export { buildReport } from "./report/reportBuilder.js";

export {
  DefaultComplexityAnalyzerAdapter,
} from "./adapters/adapters.js";
export type { ComplexityAnalyzerAdapter, ExecutionAdapter, ExecutionResult, CodeQualityAdapter, CodeQualitySignal } from "./adapters/adapters.js";
