/**
 * Feature 35 — Technical Interview Integration
 * Domain vocabulary. Every enum here corresponds to a state explicitly
 * required by the build spec (section references in comments). Nothing
 * here is a numeric "score" — evidence is represented as bounded states,
 * never as an invented float, matching the spec's ban on arbitrary
 * confidence numbers (§12) and fake precision (§54).
 */

// ---------------------------------------------------------------------------
// §7 Interview modes — one configurable engine, not nine separate ones.
// ---------------------------------------------------------------------------
export const INTERVIEW_MODES = [
  "TECHNICAL_SCREENING",
  "PROJECT_DEFENSE",
  "CODE_DEFENSE",
  "SKILL_VERIFICATION",
  "DEEP_TECHNICAL",
  "DEBUGGING_INTERVIEW",
  "ARCHITECTURE_INTERVIEW",
  "SCENARIO_INTERVIEW",
  "GAP_VERIFICATION",
] as const;
export type InterviewMode = (typeof INTERVIEW_MODES)[number];

// ---------------------------------------------------------------------------
// §37 Interview session state machine
// ---------------------------------------------------------------------------
export const SESSION_STATES = [
  "CREATED",
  "READY",
  "IN_PROGRESS",
  "PAUSED",
  "RESUMED",
  "COMPLETED",
  "EVALUATION_PENDING",
  "EVALUATION_FAILED",
  "CANCELLED",
] as const;
export type SessionState = (typeof SESSION_STATES)[number];

// ---------------------------------------------------------------------------
// §11 Evidence states — missing evidence stays missing, never becomes failure
// ---------------------------------------------------------------------------
export const EVIDENCE_STATES = [
  "VERIFIED",
  "PARTIALLY_VERIFIED",
  "UNCERTAIN",
  "UNASSESSED",
] as const;
export type EvidenceState = (typeof EVIDENCE_STATES)[number];

// ---------------------------------------------------------------------------
// §12 Evidence confidence — qualitative bands, never an arbitrary number
// ---------------------------------------------------------------------------
export const CONFIDENCE_BANDS = ["LOW", "MODERATE", "HIGH"] as const;
export type ConfidenceBand = (typeof CONFIDENCE_BANDS)[number];

// ---------------------------------------------------------------------------
// §28 Per-skill coverage state + §29 interview-level coverage
// ---------------------------------------------------------------------------
export const SKILL_COVERAGE_STATES = [
  "UNASSESSED",
  "PARTIALLY_ASSESSED",
  "SUFFICIENTLY_ASSESSED",
] as const;
export type SkillCoverageState = (typeof SKILL_COVERAGE_STATES)[number];

// ---------------------------------------------------------------------------
// §31 Partial answers — never binary pass/fail. §32 "I don't know" is its
// own explicit state, not a failure.
// ---------------------------------------------------------------------------
export const ANSWER_QUALITIES = [
  "CORRECT",
  "MOSTLY_CORRECT",
  "PARTIALLY_CORRECT",
  "INCORRECT",
  "INSUFFICIENT",
  "DONT_KNOW",
] as const;
export type AnswerQuality = (typeof ANSWER_QUALITIES)[number];

// ---------------------------------------------------------------------------
// §21 Code-answer consistency — never auto-interpreted as dishonesty
// ---------------------------------------------------------------------------
export const CONSISTENCY_CLASSIFICATIONS = [
  "CONSISTENT",
  "PARTIALLY_CONSISTENT",
  "UNCERTAIN",
  "POTENTIAL_INCONSISTENCY",
] as const;
export type ConsistencyClassification = (typeof CONSISTENCY_CLASSIFICATIONS)[number];

// ---------------------------------------------------------------------------
// §15 Question types
// ---------------------------------------------------------------------------
export const QUESTION_TYPES = [
  "CONCEPTUAL",
  "APPLIED",
  "CODE_BASED",
  "PROJECT_BASED",
  "DEBUGGING",
  "ARCHITECTURE",
  "SCENARIO",
  "TRADE_OFF",
  "VERIFICATION",
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

// ---------------------------------------------------------------------------
// §27 Progressive depth ladder
// ---------------------------------------------------------------------------
export const DEPTH_LEVELS = [
  "DEFINITION",
  "APPLICATION",
  "REASONING",
  "TRADE_OFF",
  "FAILURE_SCENARIO",
] as const;
export type DepthLevel = (typeof DEPTH_LEVELS)[number];

// ---------------------------------------------------------------------------
// §26 Adaptive follow-up trigger reasons
// ---------------------------------------------------------------------------
export const FOLLOW_UP_REASONS = [
  "DEEPER",
  "CLARIFICATION",
  "VERIFICATION",
  "EVIDENCE_CHECK",
] as const;
export type FollowUpReason = (typeof FOLLOW_UP_REASONS)[number];

export const SKILL_IMPORTANCE = ["CORE", "IMPORTANT", "SUPPORTING", "OPTIONAL"] as const;
export type SkillImportance = (typeof SKILL_IMPORTANCE)[number];

export const DIFFICULTY_LEVELS = ["EASY", "MEDIUM", "HARD"] as const;
export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

// ---------------------------------------------------------------------------
// Shared shapes
// ---------------------------------------------------------------------------

/** §9 role skill requirement, sourced from the existing Role-Based Skill Model — never invented locally. */
export interface RoleSkillRequirement {
  skill: string;
  importance: SkillImportance;
  expectedDifficulty: DifficultyLevel;
  dependsOn?: string[];
}

export interface RoleSkillRequirements {
  role: string;
  skills: RoleSkillRequirement[];
}

/** §10 candidate evidence — only sources that actually exist are populated; everything else is simply absent. */
export interface EvidenceArtifactRef {
  sourceType:
    | "CODING_SUBMISSION"
    | "PROJECT_SUBMISSION"
    | "CODE_QUALITY"
    | "DEBUGGING_EVIDENCE"
    | "REASONING_EVIDENCE"
    | "UNDERSTANDING_EVIDENCE"
    | "SKILL_SNAPSHOT"
    | "SKILL_SIGNAL"
    | "ROLE_SKILL_GAP"
    | "PREVIOUS_INTERVIEW";
  artifactId: string;
  skill: string;
  summary: string;
  /** Raw content Feature 35 is allowed to ground questions in (e.g. actual function source). Optional — not every source carries inspectable content. */
  content?: string;
  capturedAt: string;
}

export interface CandidateEvidenceBundle {
  candidateId: string;
  /** Keyed by skill so question selection can look up "what do we already know about SQL" in O(1). */
  bySkill: Record<string, EvidenceArtifactRef[]>;
}

export interface InterviewBlueprint {
  id: string;
  orgId: string;
  version: number;
  targetRole: string;
  mode: InterviewMode;
  difficulty: DifficultyLevel | "ADAPTIVE";
  targetSkills: RoleSkillRequirement[];
  evidenceSourcesUsed: EvidenceArtifactRef["sourceType"][];
  questionStrategy: {
    prioritizeUncertainty: boolean;
    diversityWindow: number; // §13 avoid repeating same skill/type back-to-back within this window
  };
  followUpStrategy: {
    maxDepthPerTopic: number; // caps §27 progressive-depth ladder so it can't loop forever
    maxFollowUpsPerQuestion: number;
  };
  coverageRules: {
    sufficientEvidenceThreshold: ConfidenceBand; // a skill is SUFFICIENTLY_ASSESSED once it reaches at least this band
    minQuestionsPerCoreSkill: number;
  };
  evaluationRules: {
    dimensions: EvaluationDimension[];
  };
  timeConfig: {
    maxQuestions: number;
    maxDurationMinutes: number;
  };
  createdBy: string;
  createdAt: string;
}

export const EVALUATION_DIMENSIONS = [
  "TECHNICAL_CORRECTNESS",
  "REASONING_QUALITY",
  "UNDERSTANDING",
  "DEPTH",
  "APPLICATION",
  "CONSISTENCY",
  "COMMUNICATION_CLARITY",
] as const;
export type EvaluationDimension = (typeof EVALUATION_DIMENSIONS)[number];

export interface InterviewQuestion {
  id: string;
  sessionId: string;
  sequenceNumber: number;
  questionType: QuestionType;
  skill: string;
  difficulty: DifficultyLevel;
  depthLevel: DepthLevel;
  promptText: string;
  /** §14/§19/§20 — a question grounded in real evidence must say which artifact it's grounded in. Absent only for pure CONCEPTUAL questions with no candidate-specific grounding available. */
  evidenceRef?: { sourceType: EvidenceArtifactRef["sourceType"]; artifactId: string };
  generatedBy: "AI" | "BANK";
  parentQuestionId?: string; // set when this question is a follow-up
  followUpReason?: FollowUpReason;
}

export interface InterviewResponse {
  id: string;
  sessionId: string;
  questionId: string;
  candidateId: string;
  responseText: string;
  submittedAt: string;
  idempotencyKey: string;
}

export interface StructuredEvaluation {
  id: string;
  responseId: string;
  evaluationVersion: number;
  answerQuality: AnswerQuality;
  consistency: ConsistencyClassification;
  dimensions: Partial<Record<EvaluationDimension, "STRONG" | "ADEQUATE" | "WEAK" | "NOT_APPLICABLE">>;
  evidenceConfidence: ConfidenceBand;
  /** Short, grounded, human-readable rationale. Never exposes hidden scoring rules to the candidate (§18). */
  rationaleSummary: string;
  status: "COMPLETED" | "PENDING" | "FAILED";
  /** True only when the AI grounded its evaluation in supplied context; false triggers a required re-check rather than being trusted (§44). */
  grounded: boolean;
}

export interface SkillEvidenceRecord {
  skill: string;
  evidenceState: EvidenceState;
  confidence: ConfidenceBand;
  supportingEvaluationIds: string[];
}

export interface InterviewCoverageReport {
  requiredSkills: string[];
  perSkill: Record<string, SkillCoverageState>;
  sufficientlyAssessed: string[];
  partiallyAssessed: string[];
  unassessed: string[];
  /** §29 — the report itself says plainly whether coverage was complete; never silently reported as full when it wasn't. */
  isComplete: boolean;
}

export interface InterviewSession {
  id: string;
  orgId: string;
  blueprintId: string;
  blueprintVersion: number;
  candidateId: string;
  state: SessionState;
  currentQuestionId: string | null;
  startedAt: string | null;
  pausedAt: string | null;
  resumedAt: string | null;
  completedAt: string | null;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface TenantContext {
  orgId: string;
  actorId: string;
  actorRole: "CANDIDATE" | "STAFF" | "SYSTEM";
}
