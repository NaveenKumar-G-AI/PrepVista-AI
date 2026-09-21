import type { Claim, ClaimVerification, Contradiction, ProblemSpec, Result } from "../types.js";
import { analyzeSource, type AstFacts } from "../analysis/astAnalyzer.js";
import { detectPatterns, type DetectedPattern } from "../analysis/patternDetector.js";
import type { ComplexityEstimate } from "../analysis/complexityEstimator.js";
import type { AIProvider } from "../ai/provider.js";
import type { ComplexityAnalyzerAdapter } from "../adapters/adapters.js";
import { DefaultComplexityAnalyzerAdapter } from "../adapters/adapters.js";
import { detectContradictions } from "./contradictionDetector.js";
import {
  verifyAlgorithmClaim,
  verifyDataStructureClaim,
  verifyImplementationDecisionClaim,
  verifyComplexityClaim,
  verifySpaceComplexityClaim,
  verifyEdgeCaseClaim,
  verifyControlFlowClaim,
  verifyInvariantClaim,
  verifyProblemUnderstandingClaim,
  verifyUnhandledClaimType,
  type VerifierContext,
} from "./verifiers.js";

export interface VerificationRunInput {
  claims: Claim[];
  sourceCode: string;
  language?: "javascript";
  problem?: ProblemSpec;
  aiProvider: AIProvider;
  complexityAdapter?: ComplexityAnalyzerAdapter;
}

export interface VerificationRunResult {
  verifications: ClaimVerification[];
  contradictions: Contradiction[];
  facts: AstFacts;
  patterns: DetectedPattern[];
  complexity: ComplexityEstimate;
}

async function verifyOne(claim: Claim, ctx: VerifierContext): Promise<ClaimVerification> {
  switch (claim.claimType) {
    case "ALGORITHM":
      return verifyAlgorithmClaim(claim, ctx);
    case "DATA_STRUCTURE":
      return verifyDataStructureClaim(claim, ctx);
    case "IMPLEMENTATION_DECISION":
      return verifyImplementationDecisionClaim(claim, ctx);
    case "COMPLEXITY":
      return verifyComplexityClaim(claim, ctx);
    case "SPACE_COMPLEXITY":
      return verifySpaceComplexityClaim(claim, ctx);
    case "EDGE_CASE":
      return verifyEdgeCaseClaim(claim, ctx);
    case "CONTROL_FLOW":
      return verifyControlFlowClaim(claim, ctx);
    case "INVARIANT":
      return verifyInvariantClaim(claim, ctx);
    case "PROBLEM_UNDERSTANDING":
      return verifyProblemUnderstandingClaim(claim, ctx);
    case "CORRECTNESS":
    case "OPTIMIZATION":
    case "TRADEOFF":
    case "BEHAVIOR":
    default:
      return verifyUnhandledClaimType(claim);
  }
}

export async function runVerification(input: VerificationRunInput): Promise<Result<VerificationRunResult>> {
  const language = input.language ?? "javascript";
  const parsed = analyzeSource(input.sourceCode, language);
  if (!parsed.ok) return parsed;

  const facts = parsed.value;
  const patterns = detectPatterns(facts);
  const complexityAdapter = input.complexityAdapter ?? new DefaultComplexityAnalyzerAdapter();
  const complexity = await complexityAdapter.analyze({ sourceCode: input.sourceCode, facts, patterns });

  const ctx: VerifierContext = { facts, patterns, complexity, problem: input.problem, aiProvider: input.aiProvider };

  const verifications = await Promise.all(input.claims.map((claim) => verifyOne(claim, ctx)));
  const contradictions = detectContradictions(input.claims, verifications);

  return { ok: true, value: { verifications, contradictions, facts, patterns, complexity } };
}
