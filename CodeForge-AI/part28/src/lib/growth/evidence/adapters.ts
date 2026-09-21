/**
 * ---------------------------------------------------------------------------
 * INTEGRATION SEAM — read this before anything else in this file.
 * ---------------------------------------------------------------------------
 * This growth-tracking module was built standalone, without the real
 * CodeForge repository attached, so it has never seen the actual output
 * types of your Correctness Analysis, Complexity Analysis, Debugging Coach,
 * Reasoning Verification, Code Review, or Adaptive Challenge systems.
 *
 * What's below is a best-guess, clearly-typed placeholder for each of those
 * systems' output shape, based only on what the build prompt described.
 * Each `adaptXyz()` function is a pure mapping from "that placeholder type"
 * to `RawSourceEvent`. To integrate for real:
 *
 *   1. Replace the placeholder interface (e.g. `CorrectnessAnalysisResult`)
 *      with an import of your actual type.
 *   2. Adjust the field access inside the adapter to match.
 *   3. Everything downstream (normalize -> engine -> API) is unaffected,
 *      because it only ever sees the normalized `RawSourceEvent` /
 *      `GrowthEvidence` shape.
 *
 * Do NOT let this file grow into a second analysis engine. Every adapter
 * here must be a pure, boring field mapping — if you find yourself
 * re-deriving pass/fail or re-scoring confidence in here, that logic
 * belongs in the source system, not here.
 * ---------------------------------------------------------------------------
 */

import type { RawSourceEvent } from "./normalize.ts";
import type { AssistanceLevel, DifficultyLevel, GrowthDimension } from "../types.ts";

// ---- placeholder upstream shapes -------------------------------------------------

export interface CorrectnessAnalysisResult {
  submissionId: string;
  studentId: string;
  challengeId: string;
  challengeFamily: string;
  passed: boolean;
  edgeCasesPassed: number;
  edgeCasesTotal: number;
  confidence: number;
  assistanceLevel: AssistanceLevel;
  difficulty: DifficultyLevel;
  isTransferChallenge: boolean;
  isRetentionChallenge: boolean;
  roleContext: string | null;
  submittedAt: string;
}

export interface ComplexityAnalysisResult {
  submissionId: string;
  studentId: string;
  challengeId: string;
  challengeFamily: string;
  achievedOptimalComplexity: boolean;
  confidence: number;
  assistanceLevel: AssistanceLevel;
  difficulty: DifficultyLevel;
  isTransferChallenge: boolean;
  analyzedAt: string;
}

export interface DebuggingSessionResult {
  sessionId: string;
  studentId: string;
  bugFamily: string;
  rootCauseIdentified: boolean;
  fixVerified: boolean;
  hintsUsed: number;
  difficulty: DifficultyLevel;
  isTransferScenario: boolean;
  completedAt: string;
}

export interface ReasoningVerificationResult {
  verificationId: string;
  studentId: string;
  challengeFamily: string;
  reasoningConsistentWithCode: boolean;
  confidence: number;
  assistanceLevel: AssistanceLevel;
  verifiedAt: string;
}

export interface CodeReviewResponseResult {
  reviewId: string;
  studentId: string;
  findingsResolved: number;
  findingsTotal: number;
  respondedAt: string;
}

// ---- adapters ----------------------------------------------------------------

function outcomeFromRate(resolved: number, total: number): RawSourceEvent["outcome"] {
  if (total === 0) return "PARTIAL";
  const rate = resolved / total;
  if (rate >= 0.95) return "SUCCESS";
  if (rate > 0) return "PARTIAL";
  return "FAILURE";
}

export function adaptCorrectness(r: CorrectnessAnalysisResult): RawSourceEvent {
  return {
    sourceType: "correctness",
    sourceId: r.submissionId,
    studentId: r.studentId,
    dimension: "correctness" satisfies GrowthDimension,
    outcome: r.passed ? outcomeFromRate(r.edgeCasesPassed, r.edgeCasesTotal) : "FAILURE",
    sourceConfidence: r.confidence,
    assistanceLevel: r.assistanceLevel,
    difficulty: r.difficulty,
    isTransfer: r.isTransferChallenge,
    isRetentionCheck: r.isRetentionChallenge,
    challengeFamily: r.challengeFamily,
    roleContext: r.roleContext,
    occurredAt: r.submittedAt,
    context: { challengeId: r.challengeId, edgeCasesPassed: r.edgeCasesPassed, edgeCasesTotal: r.edgeCasesTotal },
  };
}

export function adaptComplexity(r: ComplexityAnalysisResult): RawSourceEvent {
  return {
    sourceType: "complexity",
    sourceId: r.submissionId,
    studentId: r.studentId,
    dimension: "complexity_understanding" satisfies GrowthDimension,
    outcome: r.achievedOptimalComplexity ? "SUCCESS" : "PARTIAL",
    sourceConfidence: r.confidence,
    assistanceLevel: r.assistanceLevel,
    difficulty: r.difficulty,
    isTransfer: r.isTransferChallenge,
    isRetentionCheck: false,
    challengeFamily: r.challengeFamily,
    roleContext: null,
    occurredAt: r.analyzedAt,
    context: { challengeId: r.challengeId },
  };
}

export function adaptDebugging(r: DebuggingSessionResult): RawSourceEvent {
  return {
    sourceType: "debugging",
    sourceId: r.sessionId,
    studentId: r.studentId,
    dimension: "debugging" satisfies GrowthDimension,
    outcome: r.rootCauseIdentified && r.fixVerified ? "SUCCESS" : r.rootCauseIdentified || r.fixVerified ? "PARTIAL" : "FAILURE",
    sourceConfidence: 0.9,
    assistanceLevel: r.hintsUsed === 0 ? "NONE" : r.hintsUsed <= 2 ? "LOW" : r.hintsUsed <= 4 ? "MODERATE" : "HIGH",
    difficulty: r.difficulty,
    isTransfer: r.isTransferScenario,
    isRetentionCheck: false,
    challengeFamily: r.bugFamily,
    roleContext: null,
    occurredAt: r.completedAt,
    context: { hintsUsed: r.hintsUsed },
  };
}

export function adaptReasoning(r: ReasoningVerificationResult): RawSourceEvent {
  return {
    sourceType: "reasoning",
    sourceId: r.verificationId,
    studentId: r.studentId,
    dimension: "code_reasoning_consistency" satisfies GrowthDimension,
    outcome: r.reasoningConsistentWithCode ? "SUCCESS" : "FAILURE",
    sourceConfidence: r.confidence,
    assistanceLevel: r.assistanceLevel,
    difficulty: null,
    isTransfer: false,
    isRetentionCheck: false,
    challengeFamily: r.challengeFamily,
    roleContext: null,
    occurredAt: r.verifiedAt,
    context: {},
  };
}

export function adaptCodeReview(r: CodeReviewResponseResult): RawSourceEvent {
  return {
    sourceType: "code_review",
    sourceId: r.reviewId,
    studentId: r.studentId,
    dimension: "code_review_ability" satisfies GrowthDimension,
    outcome: outcomeFromRate(r.findingsResolved, r.findingsTotal),
    sourceConfidence: 0.8,
    assistanceLevel: "NONE",
    difficulty: null,
    isTransfer: false,
    isRetentionCheck: false,
    challengeFamily: "code_review",
    roleContext: null,
    occurredAt: r.respondedAt,
    context: { findingsResolved: r.findingsResolved, findingsTotal: r.findingsTotal },
  };
}
