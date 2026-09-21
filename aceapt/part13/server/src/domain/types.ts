// ACEAPT AI — Feature 13 domain types.
//
// This file is the single source of truth for the vocabulary used across the
// readiness engines. If you're wiring this into the real ACEAPT codebase,
// this is the file to reconcile against your existing types first.

export const READINESS_DIMENSION_KEYS = [
  "concept",
  "accuracy",
  "speed",
  "time_pressure",
  "mixed_topic",
  "novel_question",
  "retention",
  "consistency",
  "assessment_condition",
  "recovery",
  "question_selection",
  "time_allocation",
] as const;

export type ReadinessDimensionKey = (typeof READINESS_DIMENSION_KEYS)[number];

/** Section 2 — overall certification state. Evidence-gated, not just score-gated. */
export const READINESS_STATES = [
  "INSUFFICIENT_EVIDENCE",
  "EARLY_EVIDENCE",
  "DEVELOPING",
  "NEAR_READY",
  "CONDITIONALLY_READY",
  "STRONGLY_READY",
] as const;
export type ReadinessState = (typeof READINESS_STATES)[number];

/** Section 19 — per-dimension status used in the gap map. Deliberately a
 * coarser 3-tier scale than the overall state: the gap map's job is to say
 * "where should the student look first", not to re-certify each dimension. */
export const DIMENSION_STATUSES = ["READY", "DEVELOPING", "HIGH_RISK"] as const;
export type DimensionStatus = (typeof DIMENSION_STATUSES)[number];

export const CONFIDENCE_LEVELS = ["LOW", "MEDIUM", "HIGH"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const PRACTICE_MODES = [
  "topic_practice",
  "timed_practice",
  "mixed_practice",
  "realistic_simulation",
] as const;
export type PracticeMode = (typeof PRACTICE_MODES)[number];

export const SIMULATION_STATUSES = ["not_started", "in_progress", "submitted", "abandoned"] as const;
export type SimulationStatus = (typeof SIMULATION_STATUSES)[number];

export const EVENT_TYPES = [
  "ASSESSMENT_STARTED",
  "QUESTION_VIEWED",
  "QUESTION_ANSWERED",
  "QUESTION_SKIPPED",
  "QUESTION_REVISITED",
  "QUESTION_SUBMITTED",
  "ASSESSMENT_SECTION_CHANGED",
  "ASSESSMENT_SUBMITTED",
  "ASSESSMENT_ABANDONED",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const ATTEMPT_FINAL_STATUSES = ["answered", "skipped", "unanswered", "flagged"] as const;
export type AttemptFinalStatus = (typeof ATTEMPT_FINAL_STATUSES)[number];

export type Difficulty = "easy" | "medium" | "hard";

// ---------------------------------------------------------------------------
// Simulation-side shapes (what the engines consume)
// ---------------------------------------------------------------------------

export interface QuestionAttempt {
  questionId: string;
  topicId: string;
  topicName: string;
  difficulty: Difficulty;
  section: string;
  sequencePosition: number; // 1-based order within the simulation
  selectedOptionId: string | null;
  isCorrect: boolean | null;
  timeSpentSeconds: number;
  expectedTimeSeconds: number;
  skipCount: number;
  revisitCount: number;
  finalStatus: AttemptFinalStatus;
}

export interface SimulationRecord {
  id: string;
  studentId: string;
  profileId: string;
  practiceMode: PracticeMode;
  status: SimulationStatus;
  startedAt: string | null;
  submittedAt: string | null;
  durationMinutes: number;
  totalScore: number | null;
  maxScore: number | null;
  accuracy: number | null; // 0-1
  attempts: QuestionAttempt[];
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Evidence & confidence (Sections 3, 18, 21)
// ---------------------------------------------------------------------------

export interface Evidence {
  id: string;
  dimensionKey: ReadinessDimensionKey | null; // null = supports the overall claim
  claim: string;
  observation: string;
  sampleSize: number;
  timeWindow: string;
  confidence: ConfidenceLevel;
  supportingData: Record<string, unknown>;
}

export interface ConfidenceInputs {
  sampleSize: number;
  recencyDays: number | null; // days since most recent contributing simulation
  consistency: number | null; // 0-1, higher = less variance across attempts
  assessmentSimilarity: number; // 0-1, how "realistic" the evidence source is (Section 3)
  novelty: number; // 0-1, fraction of unseen questions (Section 40)
  topicCoverage: number; // 0-1, fraction of target topics represented
  difficultyCoverage: number; // 0-1, fraction of difficulty bands represented
}

export interface ConfidenceResult {
  level: ConfidenceLevel;
  score: number; // 0-1 underlying weighted score — internal/explainability use, not shown to students as false precision
  limitingFactors: string[]; // human-readable reasons confidence isn't higher
}

// ---------------------------------------------------------------------------
// Readiness dimensions, gaps, snapshot (Sections 1-2, 19-20)
// ---------------------------------------------------------------------------

export interface DimensionScore {
  dimensionKey: ReadinessDimensionKey;
  score: number; // 0-100
  status: DimensionStatus;
  confidence: ConfidenceLevel;
  evidenceSummary: string;
}

export interface ReadinessGap {
  dimensionKey: ReadinessDimensionKey;
  severity: "DEVELOPING" | "HIGH_RISK";
  description: string;
  evidenceIds: string[];
}

export interface ReadinessContributor {
  dimensionKey: ReadinessDimensionKey;
  delta: number; // signed change in dimension score vs previous snapshot
  direction: "up" | "down";
}

export interface ReadinessSnapshot {
  id: string;
  studentId: string;
  profileId: string | null;
  previousSnapshotId: string | null;
  createdAt: string;
  overallScore: number;
  overallState: ReadinessState;
  confidence: ConfidenceResult;
  evidenceCount: number;
  simulationIds: string[];
  dimensions: DimensionScore[];
  gaps: ReadinessGap[];
  evidence: Evidence[];
  contributors: ReadinessContributor[];
}

// ---------------------------------------------------------------------------
// Assessment profile / blueprint (Sections 5-6)
// ---------------------------------------------------------------------------

export interface AssessmentSection {
  name: string;
  topicIds: string[];
  questionCount: number;
}

export interface AssessmentProfile {
  id: string;
  name: string;
  assessmentType: string;
  durationMinutes: number;
  questionCount: number;
  sections: AssessmentSection[];
  difficultyDistribution: Record<Difficulty, number>;
  negativeMarking: { enabled: boolean; penaltyFraction: number };
  scoringRules: { correctMarks: number; unansweredMarks: number };
  targetScore: number | null;
  questionTimeExpectationSeconds: number;
}

export interface BlueprintQuestionSlot {
  topicId: string;
  skill: string | null;
  difficulty: Difficulty;
  questionType: "mcq";
  expectedTimeSeconds: number;
  weight: number;
  section: string;
}

export interface BlueprintValidation {
  questionCountOk: boolean;
  topicCoverageOk: boolean;
  difficultyDistributionOk: boolean;
  timingOk: boolean;
  noveltyOk: boolean;
  issues: string[];
}

export interface AssessmentBlueprint {
  id: string;
  profileId: string;
  composition: BlueprintQuestionSlot[];
  validation: BlueprintValidation;
}
