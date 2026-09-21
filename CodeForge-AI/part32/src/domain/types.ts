/**
 * Core domain vocabulary for Role Skill Gap Analysis.
 *
 * These types are the shared language between the deterministic engine,
 * the persistence layer, the API, and the dashboard. Nothing in this file
 * talks to a database, an HTTP request, or an AI model - it is pure
 * business vocabulary.
 */

// ---------------------------------------------------------------------------
// Mastery scale
// ---------------------------------------------------------------------------

/**
 * Ordinal mastery scale. `null` (not a member of this enum) is used
 * throughout the codebase to mean "unassessed" - see Phase 8. We deliberately
 * do NOT give unassessed a numeric value of 0, because 0 would make it
 * sortable/comparable as "worse than Emerging", which is exactly the
 * conflation Phase 8 forbids.
 *
 * This four-level scale mirrors the exact vocabulary used in the source
 * spec's own example (Strong / Developing / Competent / Emerging). It is a
 * default representation, not a mandate - see README "Assumptions" for how
 * to swap in your real Mastery Level System's representation.
 */
export enum MasteryLevel {
  EMERGING = 1,
  DEVELOPING = 2,
  COMPETENT = 3,
  STRONG = 4,
}

export function masteryLabel(level: MasteryLevel | null): string {
  if (level === null) return "Unassessed";
  switch (level) {
    case MasteryLevel.EMERGING:
      return "Emerging";
    case MasteryLevel.DEVELOPING:
      return "Developing";
    case MasteryLevel.COMPETENT:
      return "Competent";
    case MasteryLevel.STRONG:
      return "Strong";
    default:
      return "Unknown";
  }
}

export enum DifficultyLevel {
  BEGINNER = 1,
  INTERMEDIATE = 2,
  ADVANCED = 3,
  EXPERT = 4,
}

// ---------------------------------------------------------------------------
// Role skill model (Phase 3-4, 6)
// ---------------------------------------------------------------------------

export enum RoleSkillImportance {
  CORE = "CORE",
  IMPORTANT = "IMPORTANT",
  SUPPORTING = "SUPPORTING",
  OPTIONAL = "OPTIONAL",
}

export interface EvidenceRequirement {
  minEvidenceCount: number;
  minDiversity: number;
  recencyWindowDays: number;
}

export interface RoleSkillRequirement {
  skillId: string;
  skillName: string;
  importance: RoleSkillImportance;
  weight: number; // 0-1, relative importance within the role
  requiredMastery: MasteryLevel;
  requiredDifficulty?: DifficultyLevel;
  evidenceRequirements?: EvidenceRequirement;
}

export interface DependencyEdge {
  /** The skill that has the prerequisite. */
  skillId: string;
  /** The foundational skill it depends on. */
  prerequisiteSkillId: string;
}

export interface RoleRequirementSet {
  roleId: string;
  roleName: string;
  roleModelVersion: string;
  organizationId: string;
  requirements: RoleSkillRequirement[];
  dependencyEdges: DependencyEdge[];
}

// ---------------------------------------------------------------------------
// Evidence (Phase 14-19)
// ---------------------------------------------------------------------------

/**
 * Relative strength of an evidence source, per Phase 15's ordering
 * (verified direct performance > repeated verified performance >
 * verified understanding > reasoning consistency > historical evidence >
 * weak indirect evidence). Higher is stronger.
 */
export enum EvidenceQualityTier {
  WEAK_INDIRECT = 0,
  HISTORICAL = 1,
  REASONING_CONSISTENCY = 2,
  VERIFIED_UNDERSTANDING = 3,
  REPEATED_VERIFIED_PERFORMANCE = 4,
  VERIFIED_DIRECT_PERFORMANCE = 5,
}

export type EvidenceSourceType =
  | "challenge"
  | "hidden_test"
  | "code_analysis"
  | "debugging"
  | "reasoning_check"
  | "understanding_check"
  | "adaptive_challenge"
  | "manual_review";

export interface EvidenceRecord {
  id: string;
  skillId: string;
  studentId: string;
  sourceType: EvidenceSourceType;
  qualityTier: EvidenceQualityTier;
  /** Distinguishes independent tasks for diversity accounting (Phase 16). */
  taskId?: string;
  taskType?: string;
  difficulty: DifficultyLevel;
  timestamp: string; // ISO 8601
  outcome: "pass" | "fail" | "partial";
  /** 0-100 normalized score, when the source produces one. Used for
   *  consistency/trend statistics only - never for classification directly. */
  rawScore?: number;
}

// ---------------------------------------------------------------------------
// Gap classification (Phase 7-8, 25)
// ---------------------------------------------------------------------------

export enum GapStatus {
  NO_GAP = "NO_GAP",
  BELOW_TARGET = "BELOW_TARGET",
  PARTIAL = "PARTIAL",
  UNASSESSED = "UNASSESSED",
  INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE",
  INCONSISTENT = "INCONSISTENT",
  DEPENDENCY_BLOCKED = "DEPENDENCY_BLOCKED",
}

export enum Severity {
  CRITICAL = "CRITICAL",
  HIGH = "HIGH",
  MEDIUM = "MEDIUM",
  LOW = "LOW",
}

export enum GapTrend {
  IMPROVING = "IMPROVING",
  STABLE = "STABLE",
  WORSENING = "WORSENING",
  VOLATILE = "VOLATILE",
  UNKNOWN = "UNKNOWN",
}

export enum ClosureState {
  OPEN = "OPEN",
  IN_PROGRESS = "IN_PROGRESS",
  NEARLY_CLOSED = "NEARLY_CLOSED",
  CLOSED = "CLOSED",
  REOPENED = "REOPENED",
  UNASSESSED = "UNASSESSED",
}

export interface ConsistencyResult {
  status: "CONSISTENT" | "INCONSISTENT" | "INSUFFICIENT_SAMPLE";
  sampleSize: number;
  mean?: number;
  stdDev?: number;
}

export interface ConfidenceFactors {
  quantity: number;
  quality: number;
  diversity: number;
  recency: number;
  consistency: number;
  coverage: number;
}

export interface EvidenceSummary {
  totalCount: number;
  usedEvidenceIds: string[];
  latestAt: string | null;
  oldestAt: string | null;
  diversity: number;
  averageQualityTier: number | null;
}

export interface DependencyAnnotation {
  isRootGap: boolean;
  /** Upstream prerequisite skills that currently have an open gap. */
  blockedBy: string[];
  /** Downstream skills that depend on this one and also have a gap. */
  blocks: string[];
  dependencyImpactScore: number; // 0-1
}

export interface StructuredExplanation {
  summarySentence: string;
  roleRequirement: string;
  demonstratedCapability: string;
  evidenceNote: string;
  trendNote?: string;
}

// ---------------------------------------------------------------------------
// Engine input/output
// ---------------------------------------------------------------------------

export interface SkillGapEngineInput {
  studentId: string;
  organizationId: string;
  roleId: string;
  roleName: string;
  roleModelVersion: string;
  skillId: string;
  skillName: string;
  importance: RoleSkillImportance;
  requiredMastery: MasteryLevel;
  requiredDifficulty?: DifficultyLevel;
  evidenceRequirements: EvidenceRequirement;
  /** Authoritative current state from the existing Mastery Level System.
   *  The gap engine NEVER derives this itself - see Phase 5-6. */
  currentMasteryLevel: MasteryLevel | null;
  /** Raw evidence, used only for confidence/consistency/trend/diversity -
   *  not to re-derive the mastery level. */
  evidenceRecords: EvidenceRecord[];
  previousClosureState: ClosureState | null;
}

export interface SkillGapResult {
  studentId: string;
  organizationId: string;
  roleId: string;
  roleModelVersion: string;
  gapAlgorithmVersion: string;
  skillId: string;
  skillName: string;
  importance: RoleSkillImportance;
  currentState: { masteryLevel: MasteryLevel | null; label: string };
  targetState: { masteryLevel: MasteryLevel; label: string };
  gapStatus: GapStatus;
  gapMagnitude: number;
  severity: Severity;
  priorityScore: number;
  priorityRank: number | null;
  confidence: number;
  confidenceFactors: ConfidenceFactors;
  trend: GapTrend;
  consistency: ConsistencyResult;
  closureState: ClosureState;
  closureReason: string;
  evidenceSummary: EvidenceSummary;
  dependency: DependencyAnnotation;
  explanation: StructuredExplanation;
  aiExplanation: string | null;
  calculatedAt: string;
}

export interface RoleGapProfile {
  studentId: string;
  organizationId: string;
  roleId: string;
  roleName: string;
  roleModelVersion: string;
  gapAlgorithmVersion: string;
  skills: SkillGapResult[];
  criticalGaps: SkillGapResult[];
  priorityGaps: SkillGapResult[];
  unassessedSkills: SkillGapResult[];
  rootGaps: SkillGapResult[];
  coreSkillCoverage: { total: number; meetingTarget: number };
  calculatedAt: string;
}

export interface GapHistoryEntry {
  id: string;
  organizationId: string;
  studentId: string;
  roleId: string;
  skillId: string;
  previousGapStatus: GapStatus | null;
  newGapStatus: GapStatus;
  previousClosureState: ClosureState | null;
  newClosureState: ClosureState;
  previousSeverity: Severity | null;
  newSeverity: Severity;
  changeReason: string;
  gapAlgorithmVersion: string;
  roleModelVersion: string;
  occurredAt: string;
}

export interface DomainEvent<TPayload = Record<string, unknown>> {
  type: string;
  payload: TPayload;
  occurredAt: string;
}
