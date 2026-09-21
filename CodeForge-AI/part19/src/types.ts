import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────
// Enums / taxonomies (mirrors the spec's vocabulary so downstream CodeForge
// systems can consume these values directly without a translation layer)
// ─────────────────────────────────────────────────────────────────────────

export const CLAIM_TYPES = [
  "PROBLEM_UNDERSTANDING",
  "ALGORITHM",
  "DATA_STRUCTURE",
  "CONTROL_FLOW",
  "CORRECTNESS",
  "COMPLEXITY",
  "SPACE_COMPLEXITY",
  "EDGE_CASE",
  "OPTIMIZATION",
  "IMPLEMENTATION_DECISION",
  "INVARIANT",
  "TRADEOFF",
  "BEHAVIOR",
] as const;
export type ClaimType = (typeof CLAIM_TYPES)[number];

export const CLAIM_IMPORTANCE = ["CORE", "IMPORTANT", "SUPPORTING", "INCIDENTAL"] as const;
export type ClaimImportance = (typeof CLAIM_IMPORTANCE)[number];

export const VERIFICATION_STATUS = ["SUPPORTED", "PARTIALLY_SUPPORTED", "CONTRADICTED", "UNVERIFIED"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUS)[number];

export const EVIDENCE_STRENGTH = ["DIRECT", "STRONG", "MODERATE", "WEAK", "INSUFFICIENT"] as const;
export type EvidenceStrength = (typeof EVIDENCE_STRENGTH)[number];

export const EVIDENCE_TYPES = [
  "AST_EVIDENCE",
  "CONTROL_FLOW_EVIDENCE",
  "EXECUTION_EVIDENCE",
  "TEST_EVIDENCE",
  "COMPLEXITY_EVIDENCE",
  "SOURCE_EVIDENCE",
  "PROBLEM_REQUIREMENT_EVIDENCE",
  "SEMANTIC_EVIDENCE",
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export const CONTRADICTION_CATEGORIES = [
  "ALGORITHM_MISMATCH",
  "DATA_STRUCTURE_MISMATCH",
  "CONTROL_FLOW_MISMATCH",
  "COMPLEXITY_MISMATCH",
  "SPACE_COMPLEXITY_MISMATCH",
  "EDGE_CASE_MISMATCH",
  "CORRECTNESS_REASONING_MISMATCH",
  "IMPLEMENTATION_DECISION_MISMATCH",
  "INVARIANT_MISMATCH",
  "BEHAVIOR_MISMATCH",
  "PROBLEM_UNDERSTANDING_MISMATCH",
] as const;
export type ContradictionCategory = (typeof CONTRADICTION_CATEGORIES)[number];

/** Explicit failure states. The engine returns one of these instead of ever
 *  fabricating a result — see README "Failure handling". */
export const FAILURE_REASONS = [
  "NO_REASONING",
  "PARSER_FAILURE",
  "EXECUTION_UNAVAILABLE",
  "COMPLEXITY_UNAVAILABLE",
  "AI_TIMEOUT",
  "AI_PROVIDER_FAILURE",
  "INVALID_AI_RESPONSE",
  "AMBIGUOUS_CLAIM",
  "UNSUPPORTED_LANGUAGE",
  "SOURCE_MAPPING_FAILURE",
  "DATABASE_FAILURE",
] as const;
export type FailureReason = (typeof FAILURE_REASONS)[number];

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; reason: FailureReason; message: string };

// ─────────────────────────────────────────────────────────────────────────
// Source location — never fabricated. null means "could not be mapped".
// ─────────────────────────────────────────────────────────────────────────

export interface SourceLocation {
  startLine: number;
  endLine: number;
  startCol?: number;
  endCol?: number;
}

// ─────────────────────────────────────────────────────────────────────────
// Claims
// ─────────────────────────────────────────────────────────────────────────

export interface Claim {
  claimId: string;
  claimType: ClaimType;
  originalText: string;
  normalizedMeaning: string;
  importance: ClaimImportance;
  /** Extraction confidence (0-1) — how sure the extractor is this claim was
   *  actually made, NOT whether the claim is true. Truth is what the
   *  verification engine determines from evidence. */
  confidence: number;
  /** True when a claim only matched a vague/generic-language pattern with no
   *  concrete implementation detail behind it (see claims/claimExtractor.ts). */
  isGeneric?: boolean;
}

export const ClaimSchema = z.object({
  claimId: z.string(),
  claimType: z.enum(CLAIM_TYPES),
  originalText: z.string(),
  normalizedMeaning: z.string(),
  importance: z.enum(CLAIM_IMPORTANCE),
  confidence: z.number().min(0).max(1),
  isGeneric: z.boolean().optional(),
});

// ─────────────────────────────────────────────────────────────────────────
// Evidence
// ─────────────────────────────────────────────────────────────────────────

export interface Evidence {
  evidenceType: EvidenceType;
  strength: EvidenceStrength;
  description: string;
  sourceLocation: SourceLocation | null;
  data?: Record<string, unknown>;
}

export interface ClaimVerification {
  claimId: string;
  status: VerificationStatus;
  /** Verification confidence (0-1) — how sure the engine is in `status`,
   *  driven by the strength of the underlying evidence, never invented. */
  confidence: number;
  evidence: Evidence[];
  explanation: string;
}

export interface Contradiction {
  category: ContradictionCategory;
  claimId: string;
  severity: "HIGH" | "MEDIUM" | "LOW";
  studentClaim: string;
  actualEvidence: string;
  explanation: string;
  sourceLocation: SourceLocation | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Problem representation (an input contract — this module does not invent
// problem data; it must be supplied by CodeForge's existing problem store)
// ─────────────────────────────────────────────────────────────────────────

export interface ProblemSpec {
  problemId: string;
  title: string;
  inputs: string;
  outputs: string;
  constraints: string[];
  requiredBehavior: string;
  /** e.g. "return the first non-repeating character", used to catch
   *  PROBLEM_UNDERSTANDING_MISMATCH against a differently-shaped claim like
   *  "find the most frequent character". */
  coreRequirement: string;
  edgeCases: string[];
  expectedComplexity?: { time?: string; space?: string };
}

// ─────────────────────────────────────────────────────────────────────────
// Scoring
// ─────────────────────────────────────────────────────────────────────────

export interface DimensionScore {
  dimension: string;
  score: number; // 0-100
  reason: string;
}

export interface ReasoningScore {
  overall: number; // 0-100
  band: "STRONG UNDERSTANDING" | "SOLID UNDERSTANDING" | "PARTIAL UNDERSTANDING" | "WEAK UNDERSTANDING";
  dimensions: DimensionScore[];
  confidence: "High" | "Medium" | "Low";
}

// ─────────────────────────────────────────────────────────────────────────
// Follow-up questions
// ─────────────────────────────────────────────────────────────────────────

export const FOLLOW_UP_TYPES = [
  "WHY_THIS_ALGORITHM",
  "WHY_THIS_DATA_STRUCTURE",
  "WHAT_DOES_THIS_LOOP_MAINTAIN",
  "WHY_DOES_THIS_POINTER_MOVE",
  "WHY_IS_THIS_COMPLEXITY",
  "WHAT_HAPPENS_ON_THIS_EDGE_CASE",
  "WHY_IS_THIS_BRANCH_REQUIRED",
  "WHAT_WOULD_BREAK_IF_REMOVED",
] as const;
export type FollowUpType = (typeof FOLLOW_UP_TYPES)[number];

export interface FollowUpQuestion {
  type: FollowUpType;
  question: string;
  targetClaimId: string | null;
  sourceLocation: SourceLocation | null;
}

// ─────────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────────

export interface ReasoningReport {
  submissionId: string;
  analysisVersion: string;
  reasoningVersion: number;
  generatedAt: string;
  score: ReasoningScore;
  claims: Claim[];
  verifications: ClaimVerification[];
  agreements: string[]; // short human-readable "what you understood well" lines
  contradictions: Contradiction[];
  followUpQuestions: FollowUpQuestion[];
  understanding: "STRONG" | "SOLID" | "PARTIAL" | "WEAK";
}
