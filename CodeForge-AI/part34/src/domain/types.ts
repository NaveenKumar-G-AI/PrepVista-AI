// ============================================================================
// CodeForge AI — Feature 34: Technical Interview Integration
// Domain types
//
// Shape only — no behavior lives here. See src/engine/** for algorithms,
// src/orchestration/** for use-case flows, and src/integration/ports.ts for
// the seams to the six existing CodeForge intelligence engines this feature
// must feed evidence into and never duplicate (Skill Signal Engine, Mastery
// Level System, Technical Growth Tracking, Role Skill Gap Analysis, Role
// Readiness Engine, Next Best Action Engine).
// ============================================================================

// ---- Branded identifiers ---------------------------------------------------
// Plain strings under the hood, but distinct types so a SkillId can't be
// passed where a StudentId is expected without the compiler complaining.
export type Brand<T, B extends string> = T & { readonly __brand: B };
export const brand = <B extends string>() => <T>(value: T): Brand<T, B> => value as Brand<T, B>;

export type OrgId = Brand<string, "OrgId">;
export type UserId = Brand<string, "UserId">; // whoever is acting: student, trainer, TPO, admin
export type StudentId = Brand<string, "StudentId">;
export type RoleId = Brand<string, "RoleId">;
export type SkillId = Brand<string, "SkillId">;
export type BlueprintId = Brand<string, "BlueprintId">;
export type InterviewDefinitionId = Brand<string, "InterviewDefinitionId">;
export type SessionId = Brand<string, "SessionId">;
export type QuestionId = Brand<string, "QuestionId">;
export type ResponseId = Brand<string, "ResponseId">;
export type EvaluationId = Brand<string, "EvaluationId">;
export type SkillEvidenceId = Brand<string, "SkillEvidenceId">;
export type EvidenceSourceId = Brand<string, "EvidenceSourceId">; // id of a project/challenge/debug session/etc.

export const asOrgId = brand<"OrgId">();
export const asUserId = brand<"UserId">();
export const asStudentId = brand<"StudentId">();
export const asRoleId = brand<"RoleId">();
export const asSkillId = brand<"SkillId">();
export const asBlueprintId = brand<"BlueprintId">();
export const asInterviewDefinitionId = brand<"InterviewDefinitionId">();
export const asSessionId = brand<"SessionId">();
export const asQuestionId = brand<"QuestionId">();
export const asResponseId = brand<"ResponseId">();
export const asEvaluationId = brand<"EvaluationId">();
export const asSkillEvidenceId = brand<"SkillEvidenceId">();
export const asEvidenceSourceId = brand<"EvidenceSourceId">();

// ---- Enumerations (Phase 4, 7, 14, 21, 26, 34) -----------------------------

/** Phase 34 — deterministic session states. No ambiguous transitions. */
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

/** Phase 4 — one core engine, many configurable blueprints. */
export const INTERVIEW_MODES = [
  "TECHNICAL_SCREENING",
  "PROJECT_DEFENSE",
  "CODE_DEFENSE",
  "DEEP_TECHNICAL",
  "SKILL_VERIFICATION",
  "DEBUGGING_INTERVIEW",
  "ARCHITECTURE_INTERVIEW",
  "FOLLOW_UP_VERIFICATION",
] as const;
export type InterviewMode = (typeof INTERVIEW_MODES)[number];

/** Phase 7 — evidence availability. Missing evidence is a state, not a failure. */
export const EVIDENCE_STATES = ["VERIFIED", "PARTIALLY_VERIFIED", "UNCERTAIN", "UNASSESSED"] as const;
export type EvidenceState = (typeof EVIDENCE_STATES)[number];

/** Phase 14 — code vs. explanation consistency. Never auto-labels dishonesty. */
export const CONSISTENCY_CLASSES = [
  "CONSISTENT",
  "PARTIALLY_CONSISTENT",
  "UNCERTAIN",
  "POTENTIAL_INCONSISTENCY",
] as const;
export type ConsistencyClass = (typeof CONSISTENCY_CLASSES)[number];

/** Phase 26 — partial correctness, never forced to pass/fail. */
export const CORRECTNESS_CLASSES = [
  "CORRECT",
  "MOSTLY_CORRECT",
  "PARTIALLY_CORRECT",
  "INCORRECT",
  "INSUFFICIENT", // covers explicit "I don't know" (Phase 27) and non-answers
] as const;
export type CorrectnessClass = (typeof CORRECTNESS_CLASSES)[number];

/** Phase 5 — role skill importance tiers, sourced from the Role-Based Skill Model. */
export const SKILL_IMPORTANCE = ["CORE", "IMPORTANT", "SUPPORTING", "OPTIONAL"] as const;
export type SkillImportance = (typeof SKILL_IMPORTANCE)[number];

/** Phase 21 — the four adaptive branches the follow-up engine reacts to. */
export const ADAPTIVE_SIGNALS = ["STRONG", "WEAK", "UNCERTAIN", "CONTRADICTION"] as const;
export type AdaptiveSignal = (typeof ADAPTIVE_SIGNALS)[number];

/** Provenance of a question, for auditability (Phase 68) and anti-gaming (Phase 54). */
export const QUESTION_ORIGINS = ["AI_GENERATED", "TEMPLATE", "FOLLOW_UP"] as const;
export type QuestionOrigin = (typeof QUESTION_ORIGINS)[number];

/** Phase 42 — AI failure must never become student failure. */
export const EVALUATION_STATUSES = ["OK", "EVALUATION_PENDING", "EVALUATION_FAILED"] as const;
export type EvaluationStatus = (typeof EVALUATION_STATUSES)[number];

export type ResponseModality = "TEXT" | "VOICE";

/** Phase 6 — where student evidence may come from. */
export const EVIDENCE_SOURCE_TYPES = [
  "CODING_CHALLENGE",
  "PROJECT_SUBMISSION",
  "DEBUG_SESSION",
  "CODE_QUALITY_ANALYSIS",
  "COMPLEXITY_ANALYSIS",
  "REASONING_VERIFICATION",
  "UNDERSTANDING_CHECK",
  "TECHNICAL_SKILL_SNAPSHOT",
  "SKILL_SIGNAL",
  "ROLE_SKILL_GAP",
  "PREVIOUS_INTERVIEW",
] as const;
export type EvidenceSourceType = (typeof EVIDENCE_SOURCE_TYPES)[number];

/** Phase 25 — evaluation dimensions. Only the relevant subset is populated per question. */
export const EVALUATION_DIMENSION_KEYS = [
  "technicalCorrectness",
  "reasoningQuality",
  "understanding",
  "depth",
  "application",
  "communicationClarity",
] as const;
export type EvaluationDimensionKey = (typeof EVALUATION_DIMENSION_KEYS)[number];

// ---- Role & student evidence context (Phase 5, 6, 7) -----------------------

export interface RoleSkillRequirement {
  skillId: SkillId;
  skillName: string;
  importance: SkillImportance;
  targetMastery: number; // 0-1, sourced from the existing Role-Based Skill Model
  dependsOn?: SkillId[];
}

/** Retrieved from the existing role model — never invented by this feature (Phase 5). */
export interface RoleContext {
  roleId: RoleId;
  roleName: string;
  roleModelVersion: string;
  skills: RoleSkillRequirement[];
}

export interface EvidenceReference {
  sourceType: EvidenceSourceType;
  sourceId: EvidenceSourceId;
  description: string;
  capturedAt: string; // ISO timestamp
}

export interface SkillEvidenceSnapshot {
  skillId: SkillId;
  evidenceState: EvidenceState;
  confidence: number; // 0-1
  sources: EvidenceReference[];
  lastUpdated: string;
}

/** Read from existing analysis systems (Phase 6). This feature never fabricates it. */
export interface StudentEvidenceContext {
  studentId: StudentId;
  perSkill: Partial<Record<SkillId, SkillEvidenceSnapshot>>;
  /** Optional: real project artifacts available for project/code defense questions (Phase 12-13). */
  projectContext?: StudentProjectContext;
}

export interface StudentProjectContext {
  projectId: EvidenceSourceId;
  title: string;
  /** High-level, verified facts about what the project actually contains/does. */
  verifiedComponents: string[]; // e.g. "REST API with JWT auth", "PostgreSQL schema with 6 tables"
  codeExcerpts: CodeExcerpt[];
}

export interface CodeExcerpt {
  id: string;
  filePath: string;
  language: string;
  startLine: number;
  endLine: number;
  content: string;
  relatedSkillIds: SkillId[];
}

// ---- Blueprint (Phase 4, 8) -------------------------------------------------

export interface BlueprintSkillTarget {
  skillId: SkillId;
  importance: SkillImportance;
  minQuestions: number;
  maxQuestions: number;
  /** If true, ask even when evidence is already VERIFIED (Phase 51 gap verification). */
  forceVerification?: boolean;
}

export interface QuestionStrategyConfig {
  preferApplied: boolean; // Phase 16
  preferScenario: boolean; // Phase 17
  preferCodeGrounded: boolean; // Phase 13
  avoidRepeatingVerifiedSkills: boolean; // Phase 9
}

export interface TimeConfig {
  maxDurationMinutes: number;
  perQuestionSoftLimitSeconds: number;
}

export interface FollowUpConfig {
  adaptiveEnabled: boolean;
  maxFollowUpDepthPerSkill: number; // Phase 22 — bounds "unlimited questions"
}

export interface EvaluationConfig {
  dimensions: EvaluationDimensionKey[];
  requireConsistencyCheck: boolean; // Phase 14, only meaningful when code-grounded
}

export interface CompletionRequirements {
  /** "ALL_CORE" = every CORE skill must reach at least PARTIALLY_VERIFIED. */
  minSkillsSufficientlyAssessed: number | "ALL_CORE";
  minQuestionsTotal: number;
  maxQuestionsTotal: number;
}

/** Phase 8 — the structured blueprint. One engine, many blueprints (Phase 4). */
export interface InterviewBlueprint {
  id: BlueprintId;
  key: string; // human-readable slug, e.g. "backend-engineer-project-defense-v1"
  roleId: RoleId;
  mode: InterviewMode;
  difficulty: "ADAPTIVE" | 1 | 2 | 3 | 4 | 5;
  skills: BlueprintSkillTarget[];
  evidenceSources: EvidenceSourceType[];
  questionStrategy: QuestionStrategyConfig;
  timeConfig: TimeConfig;
  followUpConfig: FollowUpConfig;
  evaluationConfig: EvaluationConfig;
  completionRequirements: CompletionRequirements;
  version: string;
}

export interface InterviewVersionInfo {
  interviewVersion: string;
  roleModelVersion: string;
  evaluationVersion: string;
}

/** Phase 38 — every session preserves the exact versions it ran against. */
export interface InterviewDefinition {
  id: InterviewDefinitionId;
  blueprint: InterviewBlueprint;
  versionInfo: InterviewVersionInfo;
  createdAt: string;
  createdBy: UserId;
}

// ---- Question / Response (Phase 3, 9-20) -----------------------------------

export interface QuestionValidationResult {
  isValid: boolean;
  checkedAt: string;
  failedChecks: Array<
    "ROLE_RELEVANCE" | "SKILL_RELEVANCE" | "DIFFICULTY" | "DUPLICATION" | "AMBIGUITY" | "UNSUPPORTED_ASSUMPTION" | "SAFETY" | "ANSWERABILITY"
  >;
}

export interface Question {
  id: QuestionId;
  sessionId: SessionId;
  skillId: SkillId;
  mode: InterviewMode;
  text: string;
  origin: QuestionOrigin;
  difficulty: 1 | 2 | 3 | 4 | 5;
  /** What this question is actually grounded in — never claims evidence it doesn't have (Phase 41). */
  groundedIn: EvidenceReference[];
  isFollowUp: boolean;
  parentQuestionId?: QuestionId;
  /** Set only when isFollowUp — which adaptive branch produced it (Phase 21). */
  followUpTrigger?: AdaptiveSignal;
  validation: QuestionValidationResult;
  askedAt: string;
}

export interface Response {
  id: ResponseId;
  sessionId: SessionId;
  questionId: QuestionId;
  studentId: StudentId;
  modality: ResponseModality;
  content: string; // transcript for voice, raw text otherwise
  submittedAt: string;
  idempotencyKey: string; // Phase 36
}

// ---- Evaluation / Skill evidence (Phase 24-30, 39-44) ----------------------

export interface EvaluationDimensions {
  technicalCorrectness?: CorrectnessClass;
  reasoningQuality?: "STRONG" | "ADEQUATE" | "WEAK" | "NOT_ASSESSED";
  understanding?: "DEMONSTRATED" | "PARTIAL" | "NOT_DEMONSTRATED" | "NOT_ASSESSED";
  depth?: "SURFACE" | "MODERATE" | "DEEP" | "NOT_ASSESSED";
  application?: "APPLIED_CORRECTLY" | "APPLIED_PARTIALLY" | "NOT_APPLIED" | "NOT_ASSESSED";
  communicationClarity?: "CLEAR" | "ADEQUATE" | "UNCLEAR" | "NOT_ASSESSED";
}

/** Phase 24 — confidence must be explainable, never an arbitrary number. */
export interface ConfidenceFactors {
  responseQuality: number; // 0-1
  questionDifficulty: number; // 0-1, normalized
  questionCount: number; // how many questions inform this skill so far
  evidenceConsistency: number; // 0-1
  projectCodeAlignment: number | null; // 0-1, null when not code-grounded
  priorEvidenceWeight: number; // 0-1, contribution from evidence that pre-dated the interview
  followUpDepth: number; // 0-1, normalized depth reached
}

export interface Evaluation {
  id: EvaluationId;
  sessionId: SessionId;
  questionId: QuestionId;
  responseId: ResponseId;
  skillId: SkillId;
  status: EvaluationStatus;
  dimensions: EvaluationDimensions;
  consistency?: ConsistencyClass;
  adaptiveSignal: AdaptiveSignal;
  confidence: number; // 0-1, derived — see src/engine/evaluation/confidence.ts
  confidenceFactors: ConfidenceFactors;
  groundingRefs: EvidenceReference[];
  evaluationVersion: string;
  failureReason?: string; // populated when status !== "OK"
  evaluatedAt: string;
}

/** Phase 44 — evidence signal, explicitly NOT a mastery score. */
export interface SkillEvidence {
  id: SkillEvidenceId;
  sessionId: SessionId;
  skillId: SkillId;
  evidenceState: EvidenceState;
  confidence: number;
  sourceEvaluationIds: EvaluationId[];
  summary: string;
  extractedAt: string;
}

// ---- Coverage & session (Phase 22, 23, 34) ---------------------------------

export interface SkillCoverageEntry {
  skillId: SkillId;
  importance: SkillImportance;
  questionsAsked: number;
  followUpDepth: number;
  currentEvidenceState: EvidenceState;
  currentConfidence: number;
  status: "SUFFICIENT" | "PARTIAL" | "UNCERTAIN" | "NOT_ASSESSED";
}

export type SessionCoverage = Partial<Record<SkillId, SkillCoverageEntry>>;

export interface InterviewSession {
  id: SessionId;
  orgId: OrgId;
  studentId: StudentId;
  interviewDefinitionId: InterviewDefinitionId;
  roleId: RoleId;
  mode: InterviewMode;
  state: SessionState;
  versionInfo: InterviewVersionInfo;
  coverage: SessionCoverage;
  questionIds: QuestionId[];
  currentQuestionId?: QuestionId;
  createdAt: string;
  startedAt?: string;
  pausedAt?: string;
  resumedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  cancelReason?: string;
}

// ---- Summary (Phase 43) -----------------------------------------------------

export interface InterviewSummary {
  sessionId: SessionId;
  generatedAt: string;
  technicalStrengths: SkillId[];
  verifiedSkills: SkillId[];
  partiallyVerifiedSkills: SkillId[];
  technicalGaps: SkillId[];
  uncertainSkills: SkillId[];
  reasoningStrength: "STRONG" | "ADEQUATE" | "WEAK" | "INSUFFICIENT_EVIDENCE";
  debuggingStrength: "STRONG" | "ADEQUATE" | "WEAK" | "INSUFFICIENT_EVIDENCE" | "NOT_APPLICABLE";
  projectUnderstanding: "STRONG" | "ADEQUATE" | "WEAK" | "INSUFFICIENT_EVIDENCE" | "NOT_APPLICABLE";
  technicalCommunication: "CLEAR" | "ADEQUATE" | "UNCLEAR" | "INSUFFICIENT_EVIDENCE";
  additionalVerificationRequired: SkillId[];
  assessmentComplete: boolean; // false when required skills were not all assessed (golden case, Phase 73)
}

export interface SkillGapSummary {
  skillId: SkillId;
  gapState: "UNCERTAIN" | "DEVELOPING" | "MET" | "NOT_MET";
  priority: "HIGH" | "MEDIUM" | "LOW";
}

// ---- Actor / tenant context (Phase 60-61) ----------------------------------

export type ActorRole = "STUDENT" | "TRAINER" | "TPO_ADMIN" | "ORG_ADMIN" | "SYSTEM_ADMIN";

export interface ActorContext {
  userId: UserId;
  orgId: OrgId;
  roles: ActorRole[];
  /** Present only for STUDENT actors — the student record this actor maps to. */
  studentId?: StudentId;
}
