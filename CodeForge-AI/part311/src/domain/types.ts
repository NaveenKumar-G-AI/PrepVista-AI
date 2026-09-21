/**
 * CodeForge — Core Domain Model
 *
 * These types are the shared vocabulary for the whole engine. They mirror the
 * data model described in the master build prompt (challenge metadata, the
 * multi-dimensional difficulty model, the mistake taxonomy, the attempt model,
 * execution states, and the challenge lifecycle). The Postgres/Supabase schema
 * in db/migrations/0001_init.sql is the persisted form of this same model.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Evidence-based skill rating for a student on one skill/subskill. */
export enum SkillLevel {
  WEAK = "WEAK",
  DEVELOPING = "DEVELOPING",
  PROFICIENT = "PROFICIENT",
  STRONG = "STRONG",
}

/** User-facing difficulty label (§10). Internally backed by DifficultyVector. */
export enum DifficultyLabel {
  FOUNDATION = "FOUNDATION",
  EASY = "EASY",
  INTERMEDIATE = "INTERMEDIATE",
  ADVANCED = "ADVANCED",
  EXPERT = "EXPERT",
}

/** Progression stage within a skill (§13). */
export enum ProgressionStage {
  FOUNDATION = "FOUNDATION",
  BASIC_APPLICATION = "BASIC_APPLICATION",
  INTERMEDIATE_APPLICATION = "INTERMEDIATE_APPLICATION",
  COMPLEX_COMBINATION = "COMPLEX_COMBINATION",
  REAL_WORLD_APPLICATION = "REAL_WORLD_APPLICATION",
}

/** Assessment mode (§9). */
export enum TaskType {
  IMPLEMENTATION = "IMPLEMENTATION",
  DEBUGGING = "DEBUGGING",
  CODE_COMPLETION = "CODE_COMPLETION",
  REFACTORING = "REFACTORING",
  OPTIMIZATION = "OPTIMIZATION",
  CODE_READING = "CODE_READING",
  OUTPUT_PREDICTION = "OUTPUT_PREDICTION",
  TEST_CREATION = "TEST_CREATION",
  ALGORITHM_SELECTION = "ALGORITHM_SELECTION",
  REAL_WORLD_ENGINEERING = "REAL_WORLD_ENGINEERING",
}

/** Execution lifecycle for a single attempt (§23). */
export enum ExecutionStatus {
  STARTED = "STARTED",
  DRAFT = "DRAFT",
  SUBMITTED = "SUBMITTED",
  RUNNING = "RUNNING",
  PASSED = "PASSED",
  FAILED = "FAILED",
  SYSTEM_ERROR = "SYSTEM_ERROR",
  ABANDONED = "ABANDONED",
}

/** Structured mistake taxonomy (§27). Extensible — UNKNOWN is the safe default. */
export enum MistakeCategory {
  OFF_BY_ONE = "OFF_BY_ONE",
  WRONG_LOOP_CONDITION = "WRONG_LOOP_CONDITION",
  NULL_HANDLING = "NULL_HANDLING",
  WRONG_DATA_STRUCTURE = "WRONG_DATA_STRUCTURE",
  WRONG_ALGORITHM = "WRONG_ALGORITHM",
  TYPE_ERROR = "TYPE_ERROR",
  INPUT_HANDLING = "INPUT_HANDLING",
  LOGIC_ERROR = "LOGIC_ERROR",
  RUNTIME_ERROR = "RUNTIME_ERROR",
  COMPLEXITY_FAILURE = "COMPLEXITY_FAILURE",
  BOUNDARY_ERROR = "BOUNDARY_ERROR",
  ASYNC_ERROR = "ASYNC_ERROR",
  API_ERROR = "API_ERROR",
  UNKNOWN = "UNKNOWN",
}

/** Challenge publishing lifecycle (§37). Only APPROVED/ACTIVE reach students. */
export enum ChallengeLifecycleStatus {
  DRAFT = "DRAFT",
  VALIDATING = "VALIDATING",
  REVIEW = "REVIEW",
  APPROVED = "APPROVED",
  ACTIVE = "ACTIVE",
  DEPRECATED = "DEPRECATED",
}

/** Test-case category (§18). */
export enum TestCategory {
  NORMAL = "NORMAL",
  EDGE = "EDGE",
  BOUNDARY = "BOUNDARY",
  NEGATIVE = "NEGATIVE",
  LARGE_INPUT = "LARGE_INPUT",
  PERFORMANCE = "PERFORMANCE",
  ADVERSARIAL = "ADVERSARIAL",
}

/**
 * Languages with a real, working executor in this prototype. The schema and
 * types below intentionally allow more (§20) — see docs/IMPLEMENTATION_MANIFEST.md
 * for which are wired up vs. modeled-only.
 */
export enum SupportedLanguage {
  PYTHON = "python",
  JAVASCRIPT = "javascript",
  JAVA = "java",
}

/** Professional context a challenge can be framed in (§8). */
export enum RoleContext {
  AI_ML_ENGINEER = "AI_ML_ENGINEER",
  BACKEND_ENGINEER = "BACKEND_ENGINEER",
  DATA_ENGINEER = "DATA_ENGINEER",
  AUTOMATION_ENGINEER = "AUTOMATION_ENGINEER",
  FRONTEND_ENGINEER = "FRONTEND_ENGINEER",
  GENERAL_SWE = "GENERAL_SWE",
}

// ---------------------------------------------------------------------------
// Difficulty (§10) — internal multi-dimensional vector, external simple label
// ---------------------------------------------------------------------------

export interface DifficultyVector {
  /** How hard the underlying idea is to understand, 1 (trivial) – 5 (deep). */
  conceptualComplexity: number;
  /** How hard the idea is to translate into working code, 1–5. */
  implementationComplexity: number;
  /** How much multi-step reasoning/planning is required, 1–5. */
  reasoningComplexity: number;
  /** How many edge cases must be anticipated and handled, 1–5. */
  edgeCaseComplexity: number;
  /** How deep the prerequisite chain is, 1–5. */
  prerequisiteDepth: number;
  /** Calibration-derived or estimated solve time, in minutes. */
  expectedTimeMinutes: number;
  /**
   * Whether expectedTimeMinutes and the 1-5 scores reflect real attempt data
   * (see ChallengeQualityAnalytics) or an initial author/AI estimate. This
   * flag exists so the system never claims calibration it doesn't have (§10, §63).
   */
  calibrated: boolean;
}

/** Deterministic mapping used across the engine — see engine/difficultyPolicy.ts. */
export const DIFFICULTY_LABEL_ORDER: DifficultyLabel[] = [
  DifficultyLabel.FOUNDATION,
  DifficultyLabel.EASY,
  DifficultyLabel.INTERMEDIATE,
  DifficultyLabel.ADVANCED,
  DifficultyLabel.EXPERT,
];

export const SKILL_LEVEL_ORDER: SkillLevel[] = [
  SkillLevel.WEAK,
  SkillLevel.DEVELOPING,
  SkillLevel.PROFICIENT,
  SkillLevel.STRONG,
];

export const PROGRESSION_ORDER: ProgressionStage[] = [
  ProgressionStage.FOUNDATION,
  ProgressionStage.BASIC_APPLICATION,
  ProgressionStage.INTERMEDIATE_APPLICATION,
  ProgressionStage.COMPLEX_COMBINATION,
  ProgressionStage.REAL_WORLD_APPLICATION,
];

// ---------------------------------------------------------------------------
// Challenge domain model (§6)
// ---------------------------------------------------------------------------

export interface TestCase {
  id: string;
  category: TestCategory;
  /** Positional arguments passed to the challenge's entry function. */
  input: unknown[];
  expectedOutput: unknown;
  hidden: boolean;
  points: number;
  /** Short human note, e.g. "empty list", shown only in internal tooling. */
  note?: string;
}

export interface ChallengeExample {
  input: string;
  output: string;
  explanation?: string;
}

export interface SolutionMetadata {
  referenceSolution: Partial<Record<SupportedLanguage, string>>;
  approachSummary: string;
  /** Big-O time complexity the reference solution achieves, if known. */
  timeComplexity?: string;
  spaceComplexity?: string;
}

export interface EvaluationMetadata {
  /** Function name the harness will call in the student's submission. */
  entryFunction: string;
  comparisonMode: "exact" | "unordered_collection";
}

/** Rolling analytics computed from real attempts (§38) — absent until enough data exists. */
export interface ChallengeQualityAnalytics {
  attemptCount: number;
  passCount: number;
  passRate: number;
  medianCompletionMs: number | null;
  avgHintsUsed: number;
  abandonmentCount: number;
  systemErrorCount: number;
  /** Populated by engine/qualityAnomaly.ts-style checks; see challengeSelector penalties. */
  flags: string[];
}

export interface Challenge {
  challengeId: string;
  version: number;
  title: string;
  /** Full student-facing brief: role, objective, scenario, task, constraints, expected behavior (§32). */
  description: string;
  roleContext: RoleContext[];
  skill: string;
  subskill: string;
  competencies: string[];
  /** Skill keys (see skillTaxonomy.ts) the student should already have at PROFICIENT+ to attempt this. */
  prerequisites: string[];
  difficulty: DifficultyVector;
  difficultyLabel: DifficultyLabel;
  progressionStage: ProgressionStage;
  taskType: TaskType;
  supportedLanguages: SupportedLanguage[];
  learningObjective: string;
  constraints: string[];
  examples: ChallengeExample[];
  starterCode: Partial<Record<SupportedLanguage, string>>;
  publicTests: TestCase[];
  hiddenTests: TestCase[];
  /** Progressive hints, index 0 = hint level 1 (§29). */
  hints: string[];
  solutionMetadata: SolutionMetadata;
  evaluationMetadata: EvaluationMetadata;
  qualityStatus: ChallengeLifecycleStatus;
  qualityAnalytics: ChallengeQualityAnalytics | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Student profile & evidence
// ---------------------------------------------------------------------------

export interface SkillEvidenceEvent {
  attemptId: string;
  challengeId: string;
  timestamp: string;
  outcome: "PASSED" | "FAILED" | "PARTIAL";
  hintsUsed: number;
  mistakeCategories: MistakeCategory[];
}

export interface StudentSkillState {
  skill: string;
  level: SkillLevel;
  /** Recommended difficulty for this student's NEXT challenge on this skill — maintained by engine/difficultyPolicy.ts, read once a challenge on this skill is resolved (not on every intermediate submission). */
  currentDifficultyLabel: DifficultyLabel;
  /** Most recent evidence first. Kept bounded — see profileUpdate in codeforgeService. */
  evidence: SkillEvidenceEvent[];
  lastUpdated: string;
}

export interface ChallengeExposureRecord {
  challengeId: string;
  skill: string;
  subskill: string;
  taskType: TaskType;
  roleContext: RoleContext;
  timestamp: string;
}

export interface StudentProfile {
  studentId: string;
  targetRole: RoleContext;
  skills: Record<string, StudentSkillState>;
  exposureHistory: ChallengeExposureRecord[];
}

// ---------------------------------------------------------------------------
// Mistakes & misconceptions (§27, §28)
// ---------------------------------------------------------------------------

export interface MistakeEvidence {
  attemptId: string;
  detail: string;
}

export interface MisconceptionRecord {
  studentId: string;
  skill: string;
  category: MistakeCategory;
  occurrences: number;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  evidence: MistakeEvidence[];
  firstSeen: string;
  lastSeen: string;
}

// ---------------------------------------------------------------------------
// Attempts (§22) — immutable once created
// ---------------------------------------------------------------------------

export interface HintUsageRecord {
  level: number;
  requestedAt: string;
}

export interface TestResult {
  testId: string;
  category: TestCategory;
  hidden: boolean;
  passed: boolean;
  actualOutput?: unknown;
  expectedOutput?: unknown;
  errorMessage?: string;
  /** Structured cause, set only when passed === false and something other than a value mismatch occurred. */
  errorKind?: "compile_error" | "runtime_error" | "resource_limit" | "system_error";
}

export interface DeterministicEvaluationResult {
  status: ExecutionStatus;
  testResults: TestResult[];
  testsPassed: number;
  testsFailed: number;
  runtimeMs: number;
  compileError: string | null;
  resourceLimitExceeded: boolean;
}

export interface AIEvaluationResult {
  provider: string;
  /** True when no live provider could be reached — see aiProvider.ts fallback chain (§44). */
  pending: boolean;
  codeQualityNote?: string;
  coachingMessage?: string;
  likelyMisconception?: string;
}

export interface Attempt {
  attemptId: string;
  studentId: string;
  challengeId: string;
  challengeVersion: number;
  language: SupportedLanguage;
  code: string;
  startedAt: string;
  submittedAt: string | null;
  executionStatus: ExecutionStatus;
  deterministicEvaluation: DeterministicEvaluationResult | null;
  aiEvaluation: AIEvaluationResult | null;
  mistakeCategories: MistakeCategory[];
  hintUsage: HintUsageRecord[];
  aiAssistanceUsed: boolean;
}

// ---------------------------------------------------------------------------
// Selection explainability (§41)
// ---------------------------------------------------------------------------

export interface SelectionReason {
  challengeId: string;
  primaryGap: string;
  secondaryGap: string | null;
  roleRelevance: "LOW" | "MEDIUM" | "HIGH";
  difficultyFit: "LOW" | "MEDIUM" | "HIGH";
  recentExposure: "LOW" | "MEDIUM" | "HIGH";
  taskDiversity: "LOW" | "MEDIUM" | "HIGH";
  score: number;
  rationale: string;
}

export interface ScoredCandidate {
  challenge: Challenge;
  reason: SelectionReason;
}
