/**
 * CodeForge AI — Understanding Check
 * Core domain types.
 *
 * These types are the shared vocabulary across the whole feature: the
 * evidence engine, probe engine, AI layer, API controllers and UI all
 * import from here. Keeping this as a single source of truth prevents the
 * "shape drift" that happens when every layer invents its own version of
 * "an evidence item."
 */

// ---------------------------------------------------------------------------
// Understanding dimensions
// ---------------------------------------------------------------------------

/** The 13 explicit understanding dimensions the system models independently. */
export const UNDERSTANDING_DIMENSIONS = [
  "problem",
  "algorithm",
  "data_structure",
  "state",
  "control_flow",
  "invariant",
  "correctness",
  "complexity",
  "space",
  "edge_case",
  "debugging",
  "adaptation",
  "transfer",
] as const;

export type UnderstandingDimension = (typeof UNDERSTANDING_DIMENSIONS)[number];

export const DIMENSION_LABELS: Record<UnderstandingDimension, string> = {
  problem: "Problem Understanding",
  algorithm: "Algorithm Understanding",
  data_structure: "Data-Structure Understanding",
  state: "State Understanding",
  control_flow: "Control-Flow Understanding",
  invariant: "Invariant Understanding",
  correctness: "Correctness Understanding",
  complexity: "Complexity Understanding",
  space: "Space Understanding",
  edge_case: "Edge-Case Understanding",
  debugging: "Debugging Understanding",
  adaptation: "Adaptation Understanding",
  transfer: "Transfer Understanding",
};

/**
 * Dimensions that primarily reflect PROCEDURAL competence (can they reproduce
 * / execute the method) vs. CONCEPTUAL understanding (can they explain,
 * predict, debug, modify, transfer the underlying idea). Used to compute the
 * two independent top-line scores. See scoringEngine.ts for the rationale.
 */
export const PROCEDURAL_WEIGHTED_DIMENSIONS: UnderstandingDimension[] = [
  "problem",
  "algorithm",
  "data_structure",
  "control_flow",
];

export const CONCEPTUAL_WEIGHTED_DIMENSIONS: UnderstandingDimension[] = [
  "state",
  "invariant",
  "correctness",
  "complexity",
  "space",
  "edge_case",
  "debugging",
  "adaptation",
  "transfer",
];

export type DimensionStatus =
  | "not_assessed"
  | "insufficient_evidence"
  | "developing"
  | "demonstrated"
  | "strong"
  | "gap_identified";

export type EvidenceStrengthLabel = "weak" | "moderate" | "strong";

export interface DimensionProfile {
  dimension: UnderstandingDimension;
  score: number; // 0-100
  confidence: number; // 0-100
  evidence_strength: EvidenceStrengthLabel;
  status: DimensionStatus;
  supporting_evidence: string[]; // evidence item ids
  identified_gaps: string[];
}

// ---------------------------------------------------------------------------
// Probes
// ---------------------------------------------------------------------------

export const PROBE_TYPES = [
  "explanation",
  "causal_why",
  "state_trace",
  "prediction",
  "invariant",
  "edge_case",
  "complexity",
  "counterfactual",
  "modification",
  "debugging",
  "alternative_approach",
  "transfer",
] as const;

export type ProbeType = (typeof PROBE_TYPES)[number];

/** Recognition -> Explanation -> Prediction -> Causal Reasoning -> Modification -> Transfer */
export const DIFFICULTY_LADDER = [
  "recognition",
  "explanation",
  "prediction",
  "causal_reasoning",
  "modification",
  "transfer",
] as const;

export type DifficultyRung = (typeof DIFFICULTY_LADDER)[number];

/** Which rung of the difficulty ladder each probe type typically occupies. */
export const PROBE_TYPE_DIFFICULTY: Record<ProbeType, DifficultyRung> = {
  explanation: "explanation",
  causal_why: "causal_reasoning",
  state_trace: "prediction",
  prediction: "prediction",
  invariant: "causal_reasoning",
  edge_case: "prediction",
  complexity: "causal_reasoning",
  counterfactual: "causal_reasoning",
  modification: "modification",
  debugging: "modification",
  alternative_approach: "modification",
  transfer: "transfer",
};

export interface Probe {
  id: string;
  assessment_id: string;
  target_dimension: UnderstandingDimension;
  target_concept: string;
  probe_type: ProbeType;
  difficulty: DifficultyRung;
  purpose: string;
  question: string;
  /** Grounding context shown to the student (code excerpt, state snapshot, input, etc). */
  grounding: ProbeGrounding;
  expected_reasoning: string;
  evaluation_criteria: string[];
  /** Ground truth used to grade the response. NEVER sent to the client. */
  expected_evidence: string;
  created_at: string;
}

export interface ProbeGrounding {
  code_excerpt?: string;
  input?: string;
  state_snapshot?: Record<string, unknown>;
  execution_fact?: string;
  /** For debugging probes: the mutated (buggy) code shown to the student.
   *  Deliberately does NOT include what changed or why — that belongs in
   *  Probe.expected_evidence, which toPublicProbe() strips before the
   *  probe reaches the client. Revealing it here would hand over the answer. */
  mutated_code?: string;
}

/** Public-safe view of a probe — expected_evidence is stripped before it reaches the client. */
export type PublicProbe = Omit<Probe, "expected_evidence">;

export function toPublicProbe(probe: Probe): PublicProbe {
  const { expected_evidence: _expected_evidence, ...rest } = probe;
  return rest;
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

export type EvidenceResult =
  | "correct"
  | "partially_correct"
  | "incorrect"
  | "ambiguous"
  | "no_response";

export interface EvidenceItem {
  id: string;
  assessment_id: string;
  dimension: UnderstandingDimension;
  concept: string;
  probe_id: string;
  probe_type: ProbeType;
  question: string;
  student_response: string;
  expected_evidence: string;
  observed_evidence: string;
  result: EvidenceResult;
  /** 0-100: how reliable/clear-cut this single evidence item is. */
  confidence: number;
  ai_provider_used: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Result classification
// ---------------------------------------------------------------------------

export const RESULT_CLASSIFICATIONS = [
  "STRONG_UNDERSTANDING",
  "UNDERSTANDING_DEMONSTRATED",
  "PARTIAL_UNDERSTANDING",
  "UNDERSTANDING_GAP",
  "INSUFFICIENT_EVIDENCE",
  "UNCERTAIN",
] as const;

export type ResultClassification = (typeof RESULT_CLASSIFICATIONS)[number];

// ---------------------------------------------------------------------------
// Submission context (input to the whole pipeline)
// ---------------------------------------------------------------------------

export interface ExecutionEvidence {
  ran: boolean;
  passed_tests: number;
  total_tests: number;
  runtime_ms?: number;
  stdout_excerpt?: string;
  stderr_excerpt?: string;
}

export interface ExistingCodeForgeAnalysis {
  /** Reused from CodeForge's existing complexity analyzer, if available. */
  complexity?: {
    time: string;
    space: string;
    dominant_operation?: string;
  };
  /** Reused from CodeForge's existing code-quality analyzer, if available. */
  quality?: {
    issues: string[];
    score?: number;
  };
  /** Reused from CodeForge's existing reasoning-verification / code-reasoning-consistency system. */
  reasoningConsistency?: {
    consistent: boolean;
    notes?: string;
  };
}

export interface RoleContext {
  role: "backend" | "frontend" | "ml" | "general" | string;
  /** Optional per-dimension importance override, e.g. backend emphasizes state/correctness/edge_case. */
  dimensionEmphasis?: Partial<Record<UnderstandingDimension, number>>;
}

export interface StudentSubmission {
  id: string;
  student_id: string;
  challenge_id: string;
  problem_statement: string;
  constraints?: string;
  language: string;
  source_code: string;
  initial_explanation?: string;
  execution: ExecutionEvidence;
  existingAnalysis?: ExistingCodeForgeAnalysis;
  role?: RoleContext;
}

// ---------------------------------------------------------------------------
// Mental model (extracted conceptual representation of the solution)
// ---------------------------------------------------------------------------

export interface StateVariable {
  name: string;
  meaning: string;
  changes_when: string;
}

export interface MentalModel {
  problem_objective: string;
  constraints: string[];
  algorithm: string;
  algorithm_steps: string[];
  important_variables: StateVariable[];
  data_structures: string[];
  state_transitions: string[];
  control_flow_summary: string;
  candidate_invariants: string[];
  correctness_argument: string;
  complexity: {
    time: string;
    space: string;
    justification: string;
  };
  tradeoffs: string[];
  relevant_edge_cases: string[];
  assumptions: string[];
  /** true if this field set came from existing CodeForge analysis rather than being freshly derived. */
  derivedFromExistingAnalysis: boolean;
}

// ---------------------------------------------------------------------------
// Assessment (top-level aggregate + persistence row shape)
// ---------------------------------------------------------------------------

export type AssessmentStatus = "in_progress" | "completed" | "abandoned";

export interface UnderstandingProfile {
  assessment_id: string;
  student_id: string;
  challenge_id: string;
  status: AssessmentStatus;
  dimensions: Record<UnderstandingDimension, DimensionProfile>;
  procedural_score: number;
  conceptual_score: number;
  overall_confidence: number;
  overall_evidence_strength: EvidenceStrengthLabel;
  classification: ResultClassification;
  probes_asked: number;
  max_probes: number;
  created_at: string;
  updated_at: string;
}

export interface Recommendation {
  dimension: UnderstandingDimension;
  gap: string;
  recommendation: string;
}

export interface AssessmentReport {
  profile: UnderstandingProfile;
  summary: {
    demonstrated: string[];
    uncertain: string[];
  };
  evidence: EvidenceItem[];
  recommendations: Recommendation[];
}
