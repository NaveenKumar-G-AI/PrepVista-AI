/**
 * CodeForge AI — Adaptive Challenge Engine (Feature 25)
 * Core domain types.
 *
 * INTEGRATION NOTE: These types mirror the entities described in the
 * Feature 25 spec (challenge metadata, skill state, student model). They
 * are a contract for THIS package, not a replacement for CodeForge's real
 * challenge / user / skill schemas. Where this engine is wired into the
 * actual repository, reconcile these with (or generate them from) the
 * existing Supabase/Postgres schema rather than keeping a second source
 * of truth. See README.md → "Integrating with the real repository".
 */

export type SkillLevel =
  | 'UNKNOWN'
  | 'INTRODUCED'
  | 'DEVELOPING'
  | 'PRACTICED'
  | 'PROFICIENT'
  | 'MASTERED'
  | 'AT_RISK'
  | 'REGRESSING'
  | 'UNCERTAIN';

export type EvidenceOutcome = 'SUCCESS' | 'FAILURE' | 'PARTIAL';

export interface DifficultyDimensions {
  algorithm: number;
  implementation: number;
  reasoning: number;
  state: number;
  debugging: number;
  constraints: number;
  edgeCases: number;
  transfer: number;
}

export const DIFFICULTY_DIMENSION_KEYS: (keyof DifficultyDimensions)[] = [
  'algorithm',
  'implementation',
  'reasoning',
  'state',
  'debugging',
  'constraints',
  'edgeCases',
  'transfer',
];

/** One observed data point feeding a skill's evidence trail. */
export interface SkillEvidencePoint {
  skillId: string;
  timestamp: string; // ISO-8601
  outcome: EvidenceOutcome;
  challengeId: string;
  challengeFamily?: string;
  transferGroup?: string;
  dimensionsExercised: Partial<DifficultyDimensions>;
  correctness?: number; // 0-1
  reasoningScore?: number; // 0-100
  consistencyScore?: number; // 0-100, code-reasoning consistency
  understandingScore?: number; // 0-100
  debuggingScore?: number; // 0-100
  qualityScore?: number; // 0-100
  hintsUsed?: number;
  attempts?: number;
  timeToSolveSeconds?: number;
}

/** Derived, current state for a single skill — the output of evidence aggregation. */
export interface SkillState {
  skillId: string;
  level: SkillLevel;
  score: number; // 0-100 aggregate
  confidence: number; // 0-1
  trend: 'IMPROVING' | 'STABLE' | 'DECLINING' | 'INSUFFICIENT_DATA';
  lastDemonstratedAt: string | null;
  evidenceCount: number;
  distinctContexts: number;
  rawRecencyScore: number; // pre-dampening estimate, kept for audit/debugging
  dampened: boolean; // true if the overfit guard altered the naive estimate
}

export interface ChallengeMetadata {
  challengeId: string;
  topic: string;
  subtopics: string[];
  learningObjectives: string[];
  primarySkillId: string;
  supportingSkillIds: string[];
  difficulty: DifficultyDimensions;
  prerequisites: string[]; // skillIds this challenge assumes are already PRACTICED+
  targetRoles: string[]; // empty = role-agnostic
  estimatedTimeMinutes: number;
  supportedLanguages: string[];
  challengeFamily: string;
  familyTier: 'BASIC' | 'INTERMEDIATE' | 'ADVANCED' | 'TRANSFER';
  transferGroup: string;
  curriculumTags: string[];
  status: 'DRAFT' | 'VALIDATING' | 'ACTIVE' | 'DEGRADED' | 'RETIRED';
  isDiagnostic: boolean;
}

export interface ChallengeHealth {
  challengeId: string;
  attemptRate: number;
  completionRate: number;
  failureRate: number;
  avgSolveTimeSeconds: number;
  hintUsageRate: number;
  abandonmentRate: number;
  ambiguityFlagCount: number;
  qualityMultiplier: number; // 0-1, folded directly into the challengeQuality scoring term
  isFlaggedBroken: boolean;
}

export interface CompletedChallengeRecord {
  challengeId: string;
  challengeFamily: string;
  transferGroup: string;
  completedAt: string;
  outcome: EvidenceOutcome;
  reasonCompleted:
    | 'REMEDIATION'
    | 'REASSESSMENT'
    | 'MASTERY_CONFIRMATION'
    | 'SPACED_RETENTION'
    | 'ASSESSMENT_RETAKE'
    | 'STANDARD';
}

export interface ManualOverride {
  overrideId: string;
  scope: 'STUDENT' | 'COHORT';
  assignedChallengeId?: string;
  requiredCurriculumTags?: string[];
  instructorId: string;
  reason: string;
  expiresAt?: string;
}

export interface CurriculumConstraints {
  requiredCurriculumTags?: string[];
  requiredChallengeCount?: number;
  difficultyCeiling?: Partial<DifficultyDimensions>;
  allowedLanguages?: string[];
  assessmentWindow?: { start: string; end: string };
  order?: string[];
}

export type PathStage =
  | 'FOUNDATION'
  | 'PRACTICE'
  | 'VARIATION'
  | 'TRANSFER'
  | 'APPLICATION'
  | 'ADVANCED'
  | 'ROLE_ASSESSMENT';

export interface AdaptivePathEvent {
  stage: PathStage;
  enteredAt: string;
  reason: string;
  challengeId?: string;
}

export interface AdaptivePathState {
  studentId: string;
  currentStage: PathStage;
  history: AdaptivePathEvent[];
}

export interface StudentModel {
  studentId: string;
  targetRole: string | null;
  skills: Record<string, SkillState>;
  evidenceBySkill: Record<string, SkillEvidencePoint[]>;
  completedChallenges: CompletedChallengeRecord[];
  curriculumConstraints?: CurriculumConstraints;
  manualOverrides?: ManualOverride[];
  studentModelVersion: string;
}

export type SelectionMode = 'PRACTICE' | 'ASSESSMENT' | 'INTERVIEW';

export interface SelectionContext {
  mode: SelectionMode;
  language?: string;
  availableTimeMinutes?: number;
  requestedRepetitionReason?: CompletedChallengeRecord['reasonCompleted'];
  interviewStage?: string;
}

export interface SelectionObjectiveWeights {
  version: string;
  skillGapFit: number;
  uncertaintyReduction: number;
  learningValue: number;
  difficultyFit: number;
  roleRelevance: number;
  curriculumFit: number;
  prerequisiteFit: number;
  transferValue: number;
  retentionValue: number;
  novelty: number;
  estimatedTimeFit: number;
  challengeQuality: number;
  engagementFit: number;
}

export type PathIntent =
  | 'DIAGNOSTIC'
  | 'REMEDIATION'
  | 'REINFORCEMENT'
  | 'TRANSFER'
  | 'PROGRESSION'
  | 'RETENTION_CHECK'
  | 'ROLE_ASSESSMENT';

export interface CandidateScoreBreakdown {
  challengeId: string;
  totalScore: number;
  components: Record<keyof Omit<SelectionObjectiveWeights, 'version'>, number>;
}

export interface NextBestChallenge {
  challengeId: string;
  selectionReason: string;
  primaryLearningTarget: string;
  supportingTargets: string[];
  difficultyFit: number;
  uncertaintyValue: number;
  roleRelevance: number;
  confidence: number;
  selectorVersion: string;
  pathIntent: PathIntent;
}

export interface SelectionAuditRecord {
  studentId: string;
  studentModelVersion: string;
  selectorVersion: string;
  weightsVersion: string;
  candidateSet: string[];
  hardConstraintsApplied: string[];
  stageTrace: { stage: string; candidatesIn: number; candidatesOut: number }[];
  rankingFactors: CandidateScoreBreakdown[]; // top-N only, for audit/explanation
  selected: NextBestChallenge | null;
  noEligibleReason?: string;
  timestamp: string;
}
