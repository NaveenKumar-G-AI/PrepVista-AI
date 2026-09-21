// ============================================================================
// ACEAPT Feature 4 — domain vocabulary
//
// These types are the contract between Feature 4 and everything around it.
// `SkillEvidenceRecord` in particular is written to be satisfiable by a real
// Feature 3 (skill intelligence) engine — this file does not assume Feature 3
// is a fixed quiz score, it assumes it is a confidence-aware, multi-dimension
// signal, which is what a Skill Signal Intelligence Engine produces.
// ============================================================================

export type Goal =
  | "PLACEMENT_PREP"
  | "APTITUDE_PREP"
  | "UPCOMING_ASSESSMENT"
  | "GENERAL_MASTERY"
  | "SPECIFIC_TARGET";

export type SkillLevel = "NOT_ASSESSED" | "LIMITED_EVIDENCE" | "DEVELOPING" | "STRONG" | "VERIFIED";

export type EvidenceStrength = "NONE" | "LIMITED" | "DEVELOPING" | "STRONG";

export type ActionType =
  | "LEARN"
  | "RELEARN"
  | "PRACTICE"
  | "DRILL"
  | "REVIEW"
  | "TRANSFER"
  | "SPEED_TRAIN"
  | "RETEST"
  | "ADVANCE"
  | "REST";

export type InterventionType =
  | "CONCEPT_REBUILD"
  | "EXAMPLE_FIRST"
  | "STEP_BY_STEP"
  | "GUIDED_PRACTICE"
  | "TARGETED_DRILL"
  | "APPLICATION_PRACTICE"
  | "TRANSFER_PRACTICE"
  | "SPEED_TRAINING"
  | "PREREQUISITE_REVIEW"
  | "RETENTION_REVIEW"
  | "VERIFICATION";

export type LearningStage =
  | "UNDERSTAND"
  | "GUIDED_PRACTICE"
  | "INDEPENDENT_PRACTICE"
  | "APPLICATION"
  | "TRANSFER"
  | "VERIFICATION"
  | "MASTERY_EVIDENCE";

export type DifficultyLevel = "FOUNDATION" | "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "CHALLENGE";

export const DIFFICULTY_LADDER: DifficultyLevel[] = [
  "FOUNDATION",
  "BEGINNER",
  "INTERMEDIATE",
  "ADVANCED",
  "CHALLENGE",
];

export type NodeStatus = "VERIFIED" | "IN_PROGRESS" | "UPCOMING" | "DEFERRED" | "REVIEW_DUE";

export type DiagnosisGap = "FOUNDATION" | "APPLICATION" | "TRANSFER" | "SPEED" | "STALE" | "MISCONCEPTION" | "NONE";

export type ActionStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "SKIPPED" | "POSTPONED";

export type LearningEventType =
  | "PATH_VIEWED"
  | "NODE_VIEWED"
  | "ACTION_STARTED"
  | "ACTION_COMPLETED"
  | "ACTION_SKIPPED"
  | "ACTION_POSTPONED"
  | "RECOMMENDATION_VIEWED"
  | "WHY_VIEWED"
  | "PATH_REGENERATED"
  | "INTERVENTION_CHANGED"
  | "HINT_USED"
  | "VERIFICATION_COMPLETED";

/** One measured dimension of a student's evidence for a skill. */
export interface DimensionEvidence {
  accuracy: number | null; // 0..1
  attempts: number;
  avgResponseTimeMs: number | null;
  lastAssessedAt: string | null; // ISO timestamp
}

export function emptyDimension(): DimensionEvidence {
  return { accuracy: null, attempts: 0, avgResponseTimeMs: null, lastAssessedAt: null };
}

/**
 * The Feature-3 contract. A real Skill Signal Intelligence Engine is expected
 * to satisfy this shape (or be adapted to it — see src/services/skillGraphService.ts
 * for the adapter seam). Four dimensions on purpose: foundation vs. application
 * is what lets the engine say "fundamentals are strong, advanced application
 * isn't" instead of collapsing a skill into one number (see diagnoseSkill).
 */
export interface SkillEvidenceRecord {
  studentId: string;
  skillId: string;
  foundation: DimensionEvidence;
  application: DimensionEvidence;
  transferFamiliar: DimensionEvidence;
  transferVariant: DimensionEvidence;
  recentDifficulty: DifficultyLevel;
  recentErrorSignatures: string[]; // most recent first, short stable codes e.g. "sign_error"
  verifiedAt: string | null;
}

export function emptyEvidence(studentId: string, skillId: string): SkillEvidenceRecord {
  return {
    studentId,
    skillId,
    foundation: emptyDimension(),
    application: emptyDimension(),
    transferFamiliar: emptyDimension(),
    transferVariant: emptyDimension(),
    recentDifficulty: "FOUNDATION",
    recentErrorSignatures: [],
    verifiedAt: null,
  };
}

export interface Diagnosis {
  primaryGap: DiagnosisGap;
  detail: string;
  evidenceRefs: string[];
}

export interface StuckSignal {
  isStuck: boolean;
  signalType:
    | "NONE"
    | "REPEATED_FAILURE"
    | "REPEATED_SAME_ERROR"
    | "EXCESSIVE_HINTS"
    | "EXCESSIVE_TIME"
    | "NO_IMPROVEMENT"
    | "REPEATED_ABANDONMENT";
  evidenceRefs: string[];
}

export interface GraphReadiness {
  isReady: boolean;
  blockingPrerequisiteId: string | null;
}

export interface PriorityFactors {
  gapSize: number;
  downstreamImpact: number;
  goalRelevance: number;
  deadlineUrgency: number;
  isBlocking: boolean;
  effortPenaltyMinutes: number;
}

export interface PriorityScore {
  skillId: string;
  score: number;
  factors: PriorityFactors;
}

export interface ActionDecision {
  actionType: ActionType;
  targetSkillId: string; // may differ from the originally-considered skill (prerequisite substitution)
  reason: string;
  evidenceBasis: string[];
  interventionType?: InterventionType;
}

export interface StudentContext {
  studentId: string;
  goal: Goal;
  availableMinutesPerSession: number;
  deadline: string | null; // ISO date, null = no deadline
  targetSkillIds?: string[]; // used when goal === "SPECIFIC_TARGET"
}

/** Static catalog entry — stands in for whatever Feature 1/3 already knows about a skill. */
export interface Skill {
  id: string;
  name: string;
  category: string;
  prerequisiteIds: string[];
  baseRelevance: Partial<Record<Goal, number>>; // 0..1 per goal, defaults to 0.5 if unset
  estimatedLearnMinutes: number;
}

export interface InterventionRecord {
  id: string;
  studentId: string;
  skillId: string;
  type: InterventionType;
  reason: string;
  sequenceIndex: number;
  createdAt: string;
  outcomeImproved: boolean | null;
}

export interface LearningEventRecord {
  id: string;
  studentId: string;
  type: LearningEventType;
  skillId: string | null;
  actionId: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export interface LearningAction {
  id: string;
  studentId: string;
  skillId: string;
  actionType: ActionType;
  reason: string;
  priority: number;
  estimatedDuration: number;
  targetCapability: string;
  difficulty: DifficultyLevel;
  evidenceBasis: string[];
  status: ActionStatus;
  interventionType: InterventionType | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  resultingEvidenceSummary: string | null;
}

export interface WhyThisExplanation {
  what: string;
  why: string;
  evidence: string;
  impact: string;
  next: string;
}

export interface PathNode {
  skillId: string;
  skillName: string;
  order: number;
  status: NodeStatus;
  priorityScore: number;
  reason: string;
  estimatedMinutes: number;
  action: ActionDecision;
}

export interface PathVersion {
  id: string;
  studentId: string;
  versionNumber: number;
  reason: string;
  triggeringEvidence: string[];
  tradeoffMessage: string | null;
  nodes: PathNode[];
  createdAt: string;
}

export interface DailyMissionSegment {
  label: string;
  minutes: number;
  description: string;
}

export interface DailyMission {
  studentId: string;
  totalMinutes: number;
  primarySkillId: string;
  segments: DailyMissionSegment[];
  generatedAt: string;
}

// ── Tuning constants (deliberately centralized and named — see README §Tuning) ──
export const FRESHNESS_THRESHOLD_DAYS = 30;
export const STRONG_ACCURACY_THRESHOLD = 0.8;
export const DEVELOPING_ACCURACY_THRESHOLD = 0.5;
export const MIN_ATTEMPTS_FOR_MODERATE = 3;
export const MIN_ATTEMPTS_FOR_STRONG = 6;
export const EASY_TRAP_ACCURACY_THRESHOLD = 0.85;
export const EASY_TRAP_MIN_ATTEMPTS = 3;
export const HARD_PUNISHMENT_ACCURACY_THRESHOLD = 0.4;
export const URGENT_DEADLINE_DAYS = 7;
export const RELAXED_DEADLINE_DAYS = 60;
export const REPEATED_ERROR_THRESHOLD = 3;
export const SPEED_SLOW_MULTIPLIER = 1.4;
export const HIGH_IMPACT_RELEVANCE_THRESHOLD = 0.6;
