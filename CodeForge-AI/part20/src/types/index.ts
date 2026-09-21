// Core domain types for the Code-Reasoning Consistency Engine.
// Deliberately decoupled from any specific ORM, framework, or AI SDK so this
// module can be dropped into an existing codebase without fighting its
// existing type system. See README.md for the integration seam.

import type { AIProvider } from "../ai/provider";

export const CONSISTENCY_DIMENSIONS = [
  "PROBLEM_ALIGNMENT",
  "ALGORITHM_ALIGNMENT",
  "DATA_STRUCTURE_ALIGNMENT",
  "STATE_ALIGNMENT",
  "CONTROL_FLOW_ALIGNMENT",
  "CORRECTNESS_ALIGNMENT",
  "COMPLEXITY_ALIGNMENT",
  "SPACE_ALIGNMENT",
  "EDGE_CASE_ALIGNMENT",
  "BEHAVIOUR_ALIGNMENT",
  "IMPLEMENTATION_DECISION_ALIGNMENT",
  "OPTIMIZATION_ALIGNMENT",
] as const;
export type ConsistencyDimension = (typeof CONSISTENCY_DIMENSIONS)[number];

export type ConsistencyState =
  | "HIGHLY_CONSISTENT"
  | "MOSTLY_CONSISTENT"
  | "PARTIALLY_CONSISTENT"
  | "SIGNIFICANTLY_INCONSISTENT"
  | "INSUFFICIENT_EVIDENCE";

export type AlignmentStatus = "MATCH" | "PARTIAL" | "MISMATCH" | "UNKNOWN";
export type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type EvidenceStrength = "DIRECT" | "STRONG" | "MODERATE" | "WEAK" | "INSUFFICIENT";

export type EvidenceSourceType =
  | "AST"
  | "SOURCE"
  | "CONTROL_FLOW"
  | "EXECUTION"
  | "TEST"
  | "COMPLEXITY"
  | "PROBLEM_REQUIREMENTS"
  | "REASONING"
  | "SEMANTIC_ANALYSIS";

export type RelationshipType =
  | "SUPPORTS"
  | "DEPENDS_ON"
  | "IMPLIES"
  | "CAUSES"
  | "IMPLEMENTS"
  | "REQUIRES"
  | "CONTRADICTS"
  | "CONSISTENT_WITH"
  | "PARTIALLY_SUPPORTS";

export type ReconciliationState =
  | "UNRESOLVED"
  | "CLARIFIED"
  | "CORRECTED"
  | "PARTIALLY_CORRECTED"
  | "STILL_INCONSISTENT";

export interface SourceLocation {
  file: string;
  startLine: number;
  endLine: number;
}

export interface Evidence {
  id: string;
  source: EvidenceSourceType;
  strength: EvidenceStrength;
  description: string;
  sourceLocation?: SourceLocation | null;
  raw?: unknown;
}

export interface Finding {
  id: string;
  dimension: ConsistencyDimension;
  severity: Severity;
  evidenceStrength: EvidenceStrength;
  confidence: number; // 0..1
  summary: string;
  studentClaim?: string;
  evidence: Evidence[];
  sourceLocation?: SourceLocation | null;
  reconciliationState: ReconciliationState;
  /** Small bag of interpolation values (e.g. { variable: "left" }) used to build targeted reconciliation questions. */
  metadata?: Record<string, string>;
}

export interface DimensionResult {
  dimension: ConsistencyDimension;
  alignment: AlignmentStatus;
  /** 0..100, or null when alignment is UNKNOWN / evidence is insufficient. Excluded from weighted scoring when null. */
  score: number | null;
  confidence: number; // 0..1
  evidenceStrength: EvidenceStrength;
  findings: Finding[];
}

export interface ClaimNode {
  id: string;
  text: string;
  dimension?: ConsistencyDimension;
}

export interface ClaimRelationship {
  fromClaimId: string;
  toClaimId: string;
  type: RelationshipType;
  confidence: number;
}

export interface RawReasoningClaim {
  id: string;
  text: string;
  /** If your existing reasoning-verification system already tags a dimension, pass it here to skip re-classification. */
  dimensionHint?: ConsistencyDimension;
  structuredHint?: {
    variable?: string;
    complexityTime?: string;
    complexitySpace?: string;
    edgeCase?: string;
    dataStructureType?: string;
  };
  verifiedTruthValue?: "TRUE" | "FALSE" | "UNVERIFIED";
  /** ids of other claims this one relates to, for building claim-graph edges */
  relatesTo?: string[];
}

export interface ProblemModel {
  id: string;
  title: string;
  inputs: string[];
  outputs: string[];
  constraints: string[];
}

export interface StudentReasoningModel {
  rawClaims: RawReasoningClaim[];
  claimsByDimension: Record<ConsistencyDimension, RawReasoningClaim[]>;
  complexityClaim?: { time?: string; space?: string };
  variableClaims: { variable: string; claimedRole: string }[];
  edgeCasePredictions: { case: string; studentPrediction: string }[];
  dataStructureClaims: { structureType: string; description: string }[];
  algorithmClaimText: string;
}

export interface ImplementationModel {
  detectedPatternSignals: string[];
  dataStructures: { name: string; type: string; growsWithInput: boolean }[];
  trustedComplexity?: { time: string; space?: string; evidence?: Evidence[] };
  variableFacts: { variable: string; facts: string[] }[];
  edgeCaseOutcomes: { case: string; actualOutcome: string }[];
  executionSummary?: { allVisibleTestsPassed: boolean; allHiddenTestsPassed?: boolean };
}

export interface ReconciliationQuestion {
  findingId: string;
  dimension: ConsistencyDimension;
  question: string;
}

export interface ConsistencyAnalysisResult {
  submissionId: string;
  overallScore: number | null;
  overallState: ConsistencyState;
  dimensionResults: DimensionResult[];
  relationships: ClaimRelationship[];
  findings: Finding[];
  recommendedReconciliationQuestion: ReconciliationQuestion | null;
  engineVersion: string;
  rulesVersion: string;
  generatedAt: string;
}

/** Shared context threaded through every dimension comparator. */
export interface ComparatorContext {
  studentModel: StudentReasoningModel;
  implementationModel: ImplementationModel;
  problem: ProblemModel;
  aiProvider: AIProvider;
  /** Results already computed earlier in DIMENSION_ORDER — e.g. CORRECTNESS_ALIGNMENT reads ALGORITHM_ALIGNMENT from here. */
  resultsSoFar: Partial<Record<ConsistencyDimension, DimensionResult>>;
}
