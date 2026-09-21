/**
 * ACEAPT Feature 30 -- PATH: domain types.
 *
 * These are the shapes every engine module, integration client, and API
 * route agrees on. PATH does not own the student/capability/target
 * "source of truth" tables long-term -- in the real ACEAPT codebase those
 * already exist (Sections 6, 41). This reference build ships light local
 * copies (see db/migrations/0001_reused_domain.sql) that stand in for them
 * so PATH is exercisable end-to-end; the boundary is deliberately drawn so
 * those tables can be swapped for the real services without touching the
 * engine layer.
 */

// ---------------------------------------------------------------------------
// Identifiers
// ---------------------------------------------------------------------------

export type Id = string; // uuid

// ---------------------------------------------------------------------------
// Capability & evidence (reused domain, Section 6/41)
// ---------------------------------------------------------------------------

export interface Capability {
  code: string; // e.g. "dsa.arrays", "quant.data_interpretation"
  name: string;
  category: string; // e.g. "quantitative" | "programming" | "communication"
}

/** The four evidence dimensions PATH reads to decide bottlenecks (Section 11, 20-21). */
export interface CapabilityDimensions {
  accuracy: number; // 0-100, conceptual correctness
  speed: number; // 0-100, performance under time pressure
  transfer: number; // 0-100, applying the capability in a novel/composite context
  consistency: number; // 0-100, stability across repeated attempts
}

export interface StudentCapabilityState extends CapabilityDimensions {
  studentId: Id;
  capabilityCode: string;
  level: number; // 0-100 composite, derived from the four dimensions
  evidenceCount: number;
  lastEvidenceAt: string | null; // ISO timestamp
}

export type EvidenceType =
  | "LEARNING"
  | "PRACTICE"
  | "PERFORMANCE"
  | "TRANSFER";

export interface EvidenceEvent {
  id: Id;
  studentId: Id;
  capabilityCode: string;
  type: EvidenceType;
  source: string; // e.g. "adapt.practice_set", "align.mock_assessment"
  result: EvidenceResult;
  occurredAt: string;
}

export interface EvidenceResult {
  correct?: number;
  total?: number;
  timeTakenSeconds?: number;
  timeAllowedSeconds?: number;
  passed?: boolean;
  contextNovelty?: "SEEN" | "NOVEL"; // drives transfer signal
}

// ---------------------------------------------------------------------------
// Target (reused domain, driven by ALIGN -- Section 38)
// ---------------------------------------------------------------------------

export interface Target {
  id: Id;
  code: string; // e.g. "data-analyst"
  name: string;
  description: string;
}

export interface TargetRequirement {
  targetId: Id;
  capabilityCode: string;
  requiredLevel: number; // 0-100
  weight: number; // relative importance, 0-1, sums to ~1 per target
  minEvidence: number; // minimum evidence events before this can be judged reliable
}

export type TargetSlot = "PRIMARY" | "SECONDARY" | "STRETCH"; // Section 29

export interface StudentTarget {
  studentId: Id;
  targetId: Id;
  slot: TargetSlot;
  deadlineDays: number | null; // null = no deadline (Section 18)
  selectedAt: string;
}

// ---------------------------------------------------------------------------
// PATH stages, milestones, actions (Sections 8, 9, 41-45)
// ---------------------------------------------------------------------------

export type MilestoneStatus =
  | "LOCKED"
  | "AVAILABLE"
  | "IN_PROGRESS"
  | "NEEDS_IMPROVEMENT"
  | "VERIFIED"
  | "MASTERED";

export type StageStatus = "LOCKED" | "ACTIVE" | "COMPLETE";

export type PathMode =
  | "FAST_TRACK"
  | "STANDARD"
  | "DEEP_MASTERY"
  | "RECOVERY"
  | "REASSESSMENT";

export type PathStatus = "ACTIVE" | "PAUSED" | "COMPLETE" | "ABANDONED";

export interface PathStage {
  id: Id;
  pathId: Id;
  key: string; // e.g. "foundation", "capability", "application"
  name: string;
  sequence: number;
  status: StageStatus;
}

export type EvidenceRequirement = {
  capabilityCode: string;
  dimension: keyof CapabilityDimensions | "level";
  minValue: number;
  minEvidenceCount: number;
};

export interface PathMilestone {
  id: Id;
  pathId: Id;
  stageId: Id;
  name: string;
  requiredCapabilities: string[]; // capability codes
  evidenceRequirements: EvidenceRequirement[];
  status: MilestoneStatus;
  priority: number; // 1 = highest
  critical: boolean; // Section 34 -- can this be skipped?
  createdAt: string;
  verifiedAt: string | null;
}

export type ActionType =
  | "LEARN"
  | "PRACTICE"
  | "REVISE"
  | "RETEST"
  | "TRANSFER"
  | "SIMULATE"
  | "PROVE"
  | "REFLECT";

export type ActionStatus = "PENDING" | "ACTIVE" | "COMPLETED" | "SKIPPED" | "SUPERSEDED";

export interface PathAction {
  id: Id;
  pathId: Id;
  studentId: Id;
  milestoneId: Id | null;
  type: ActionType;
  capabilityCode: string;
  priority: number;
  reason: string; // structured, human-readable "why" (Section 33)
  status: ActionStatus;
  createdAt: string;
  completedAt: string | null;
}

// ---------------------------------------------------------------------------
// Risk engine (Section 26)
// ---------------------------------------------------------------------------

export type RiskType =
  | "STALLING"
  | "INCONSISTENT_PERFORMANCE"
  | "LOW_EVIDENCE"
  | "CRITICAL_GAP"
  | "TIME_PRESSURE"
  | "REPEATED_FAILURE"
  | "LOW_RETENTION"
  | "TRANSFER_FAILURE";

export type RiskSeverity = "LOW" | "MEDIUM" | "HIGH";

export interface PathRisk {
  id: Id;
  pathId: Id;
  type: RiskType;
  reason: string;
  evidence: Record<string, unknown>;
  severity: RiskSeverity;
  recommendedResponse: string;
  detectedAt: string;
  resolvedAt: string | null;
}

// ---------------------------------------------------------------------------
// Readiness & bottleneck (Sections 11, 20-21)
// ---------------------------------------------------------------------------

export interface ReadinessDimension {
  key: "capability" | "application" | "transfer" | "proof";
  label: string;
  current: number; // 0-100
  target: number; // 0-100
  gapContribution: number; // 0-1, share of total distance this dimension explains
}

export interface Bottleneck {
  capabilityCode: string;
  capabilityName: string;
  dimension: keyof CapabilityDimensions;
  currentValue: number;
  targetRequirement: number;
  gap: number;
  evidence: {
    accuracy: number;
    speed: number;
    transfer: number;
    consistency: number;
    evidenceCount: number;
  };
  explanation: string;
}

export interface NextBestAction {
  action: PathAction;
  headline: string; // "Complete a targeted timed technical challenge."
  why: string;
}

export interface ReadinessProjection {
  windowLabel: string; // "approximately 6-8 weeks" (Section 37)
  weeksLow: number | null;
  weeksHigh: number | null;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  basis: string;
}

// ---------------------------------------------------------------------------
// The Path aggregate itself (Section 42)
// ---------------------------------------------------------------------------

export interface PathState {
  id: Id;
  studentId: Id;
  targetId: Id;
  slot: TargetSlot;
  mode: PathMode;
  status: PathStatus;
  currentStageId: Id | null;
  readiness: number; // 0-100
  targetReadiness: number; // 0-100
  bottleneck: Bottleneck | null;
  deadlineDays: number | null;
  lastRecalculatedAt: string;
  createdAt: string;
}

export interface PathSnapshot {
  id: Id;
  pathId: Id;
  stageKey: string;
  readiness: number;
  bottleneckCapability: string | null;
  takenAt: string;
}

export type PathChangeReason =
  | "INITIAL_GENERATION"
  | "ASSESSMENT_COMPLETED"
  | "CAPABILITY_CHANGED"
  | "ADAPTATION_COMPLETED"
  | "FORECAST_UPDATED"
  | "PROOF_COMPLETED"
  | "TARGET_CHANGED"
  | "DEADLINE_CHANGED"
  | "REPEATED_FAILURE"
  | "PERFORMANCE_DECLINE"
  | "MANUAL_RECALCULATION";

export interface PathChangeExplanation {
  reason: PathChangeReason;
  summary: string; // Section 17 -- "why did my path change?"
  previousBottleneck: string | null;
  newBottleneck: string | null;
  occurredAt: string;
}

// ---------------------------------------------------------------------------
// Composite response shapes the API returns (Section 46)
// ---------------------------------------------------------------------------

export interface PathDashboardResponse {
  path: PathState;
  target: Target;
  stages: PathStage[];
  milestones: PathMilestone[];
  bottleneck: Bottleneck | null;
  nextBestAction: NextBestAction | null;
  readinessDimensions: ReadinessDimension[];
  activeRisks: PathRisk[];
  projection: ReadinessProjection;
  lastChange: PathChangeExplanation | null;
  /** Section 53: fraction (0-1) of target requirements with enough evidence to trust. Below ~0.3, the UI should show the "we need more evidence" state instead of a fabricated-looking bottleneck. */
  evidenceCoverage: number;
}

export interface TodayResponse {
  actions: NextBestAction[];
  narrative: string;
}

export interface WeeklyReview {
  weekStart: string;
  weekEnd: string;
  capabilityDelta: number;
  readinessDelta: number;
  milestonesVerified: number;
  bottleneck: string | null;
  nextFocus: string;
}
