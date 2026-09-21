import type { ProblemSpec, ReasoningReport, Result } from "./types.js";
import type { AIProvider } from "./ai/provider.js";
import type { ComplexityAnalyzerAdapter, ExecutionAdapter, CodeQualityAdapter } from "./adapters/adapters.js";
import type { ScoringConfig } from "./scoring/scorer.js";
import { extractClaims } from "./claims/claimExtractor.js";
import { runVerification } from "./verification/verificationEngine.js";
import { generateFollowUpQuestions } from "./followup/questionGenerator.js";
import { computeScore } from "./scoring/scorer.js";
import { buildReport } from "./report/reportBuilder.js";

export interface ReasoningAdapters {
  ai: AIProvider;
  complexity?: ComplexityAnalyzerAdapter;
  execution?: ExecutionAdapter;
  codeQuality?: CodeQualityAdapter;
}

export interface RunReasoningVerificationInput {
  submissionId: string;
  sourceCode: string;
  language?: "javascript";
  reasoningText: string;
  problem?: ProblemSpec;
  analysisVersion?: string;
  reasoningVersion?: number;
  adapters: ReasoningAdapters;
  scoringConfig?: ScoringConfig;
}

/**
 * The single entry point. Consumes existing CodeForge systems only through
 * `adapters` — this function never talks to a database, sandbox, or AI
 * provider directly, so swapping any of those never touches this file.
 */
export async function runReasoningVerification(input: RunReasoningVerificationInput): Promise<Result<ReasoningReport>> {
  const claimsResult = await extractClaims({ reasoningText: input.reasoningText, aiProvider: input.adapters.ai });
  if (!claimsResult.ok) return claimsResult;

  const verificationResult = await runVerification({
    claims: claimsResult.value.claims,
    sourceCode: input.sourceCode,
    language: input.language,
    problem: input.problem,
    aiProvider: input.adapters.ai,
    complexityAdapter: input.adapters.complexity,
  });
  if (!verificationResult.ok) return verificationResult;

  const followUpQuestions = generateFollowUpQuestions(claimsResult.value.claims, verificationResult.value.contradictions);
  const score = computeScore({
    claims: claimsResult.value.claims,
    verifications: verificationResult.value.verifications,
    aiAssisted: claimsResult.value.aiAssisted,
    config: input.scoringConfig,
  });

  const report = buildReport({
    submissionId: input.submissionId,
    claims: claimsResult.value.claims,
    verifications: verificationResult.value.verifications,
    contradictions: verificationResult.value.contradictions,
    followUpQuestions,
    score,
    analysisVersion: input.analysisVersion ?? "reasoning-engine@0.1.0",
    reasoningVersion: input.reasoningVersion ?? 1,
  });

  return { ok: true, value: report };
}

export interface ReVerifyWithFollowUpInput {
  previousReport: ReasoningReport;
  followUpAnswer: string;
  sourceCode: string;
  language?: "javascript";
  problem?: ProblemSpec;
  adapters: ReasoningAdapters;
  scoringConfig?: ScoringConfig;
}

/**
 * "Follow-up verification" flow: merges the student's answer to a targeted
 * question into the claim set, re-runs verification over the combined
 * claims, and returns a new report with reasoningVersion incremented.
 * Distinguishing "forgot to mention" from "doesn't understand" happens
 * naturally here — a claim that was UNVERIFIED (missing) can become
 * SUPPORTED once the student actually states it; a wrong claim that gets
 * restated wrong again stays CONTRADICTED.
 */
export async function reVerifyWithFollowUp(input: ReVerifyWithFollowUpInput): Promise<Result<ReasoningReport>> {
  const newClaimsResult = await extractClaims({ reasoningText: input.followUpAnswer, aiProvider: input.adapters.ai });
  if (!newClaimsResult.ok) return newClaimsResult;

  const mergedClaims = [...input.previousReport.claims, ...newClaimsResult.value.claims];

  const verificationResult = await runVerification({
    claims: mergedClaims,
    sourceCode: input.sourceCode,
    language: input.language,
    problem: input.problem,
    aiProvider: input.adapters.ai,
    complexityAdapter: input.adapters.complexity,
  });
  if (!verificationResult.ok) return verificationResult;

  const followUpQuestions = generateFollowUpQuestions(mergedClaims, verificationResult.value.contradictions);
  const score = computeScore({
    claims: mergedClaims,
    verifications: verificationResult.value.verifications,
    aiAssisted: newClaimsResult.value.aiAssisted,
    config: input.scoringConfig,
  });

  const report = buildReport({
    submissionId: input.previousReport.submissionId,
    claims: mergedClaims,
    verifications: verificationResult.value.verifications,
    contradictions: verificationResult.value.contradictions,
    followUpQuestions,
    score,
    analysisVersion: input.previousReport.analysisVersion,
    reasoningVersion: input.previousReport.reasoningVersion + 1,
  });

  return { ok: true, value: report };
}
