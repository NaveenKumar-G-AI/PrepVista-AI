// ============================================================
// Shared domain types for Career Execution Intelligence.
//
// These enums are the vocabulary of the whole feature. They are
// deliberately qualitative (never a fake 0-100 "readiness score")
// per the spec's priority-engine and plan-health rules.
// ============================================================

export type ActionStatus =
  | "NOT_STARTED"
  | "STARTED"
  | "SELF_REPORTED_COMPLETE"
  | "VERIFIED_COMPLETE"
  | "MEASURED"
  | "IMPROVED"
  | "DEFERRED"
  | "BLOCKED"
  | "CANCELLED";

export type ActionType =
  | "SIMULATION"
  | "PRACTICE"
  | "CONCEPT_SESSION"
  | "REVIEW"
  | "PROJECT_WORK"
  | "REFLECTION";

export type DifficultyLevel = "BASIC" | "INTERMEDIATE" | "ADVANCED" | "REALISTIC_SIMULATION";

export type EvidenceQuality = "SELF_REPORTED" | "OBSERVED" | "VERIFIED" | "MEASURED";

export type ActionImpact = "POSITIVE_SIGNAL" | "NO_CHANGE" | "NEGATIVE_SIGNAL" | "INSUFFICIENT_DATA";

export type CapabilityTrend = "IMPROVING" | "FLAT" | "DECLINING" | "UNKNOWN";

export type PlanHealthState =
  | "ON_TRACK"
  | "NEEDS_ADJUSTMENT"
  | "OVERLOADED"
  | "BLOCKED"
  | "DEADLINE_RISK"
  | "INSUFFICIENT_DATA";

export type BlockerReasonCode =
  | "DONT_UNDERSTAND"
  | "TOO_DIFFICULT"
  | "NO_TIME"
  | "DONT_KNOW_START"
  | "MISSING_PREREQUISITE"
  | "PRIORITY_CHANGED"
  | "OTHER";

export type DeferReasonCode =
  | "TIME_UNAVAILABLE"
  | "PRIORITY_CHANGED"
  | "TASK_DIFFICULT"
  | "TASK_UNCLEAR"
  | "OPPORTUNITY_CHANGED"
  | "PERSONAL_SCHEDULE";

export type ConfidenceLevel = "LIMITED_DATA" | "EARLY_SIGNAL" | "EMERGING_PATTERN" | "REPEATED_PATTERN";

export type MomentumLabel = "INSUFFICIENT_DATA" | "RESTARTING" | "BUILDING" | "STEADY" | "STRONG";

export type OpportunityType = "INTERVIEW" | "APPLICATION_DEADLINE" | "ASSESSMENT" | "PLACEMENT_DRIVE";

export interface CareerGoal {
  id: string;
  userId: string;
  title: string;
  targetRole: string;
  status: "ACTIVE" | "ACHIEVED" | "PAUSED";
  createdAt: string;
  updatedAt: string;
}

export interface CapabilityArea {
  id: string;
  userId: string;
  goalId: string;
  name: string;
  isCurrentBottleneck: boolean;
  trend: CapabilityTrend;
  evidenceCount: number;
  lastEvidenceAt: string | null;
}

export interface Milestone {
  id: string;
  goalId: string;
  title: string;
  sequence: number;
  status: "ACTIVE" | "DONE" | "FUTURE";
}

export interface WeeklyObjective {
  id: string;
  milestoneId: string;
  title: string;
  weekStart: string;
  status: "ACTIVE" | "DONE";
}

export interface Opportunity {
  id: string;
  userId: string;
  title: string;
  organization: string | null;
  eventDate: string | null;
  opportunityType: OpportunityType;
  status: "UPCOMING" | "PAST" | "CANCELLED";
  requiredCapabilities: string[];
}

export interface Commitment {
  id: string;
  userId: string;
  title: string;
  commitmentType: "ACADEMIC" | "PERSONAL";
  eventDate: string;
  loadLevel: "LOW" | "MEDIUM" | "HIGH";
}

export interface ActionItem {
  id: string;
  userId: string;
  goalId: string;
  weeklyObjectiveId: string | null;
  capabilityAreaId: string | null;
  opportunityId: string | null;
  parentActionId: string | null;
  title: string;
  description: string | null;
  actionType: ActionType;
  difficultyLevel: DifficultyLevel;
  estimatedMinutes: number;
  status: ActionStatus;
  isPrimary: boolean;
  priorityRank: number | null;
  rationaleText: string | null;
  rationaleBullets: string[];
  rationaleGeneratedBy: "AI" | "DETERMINISTIC" | null;
  deferCount: number;
  lastDeferReason: DeferReasonCode | null;
  blockedReason: BlockerReasonCode | null;
  prerequisiteSatisfied: boolean;
  recommendedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionSessionPhase {
  title: string;
  startOffsetMin: number;
  durationMin: number;
}

export interface ExecutionSessionRecord {
  id: string;
  actionId: string;
  userId: string;
  plannedMinutes: number;
  actualMinutes: number | null;
  phases: ExecutionSessionPhase[];
  startedAt: string;
  endedAt: string | null;
}

export interface ActionEvidenceRecord {
  id: string;
  actionId: string;
  userId: string;
  evidenceQuality: EvidenceQuality;
  resultSummary: string | null;
  scoreValue: number | null;
  scoreLabel: string | null;
  notes: string | null;
  createdAt: string;
}

export interface ActionOutcomeRecord {
  id: string;
  actionId: string;
  userId: string;
  impact: ActionImpact;
  nextRecommendation: string | null;
  createdAt: string;
}

export interface ExecutionBlockerRecord {
  id: string;
  actionId: string;
  userId: string;
  reasonCode: BlockerReasonCode;
  reasonNote: string | null;
  resolutionActionId: string | null;
  createdAt: string;
}

// UI copy is centralized here so tone stays consistent (no guilt
// language — Rule 11 / Section 28) and is easy to audit in one place.
export const NO_GUILT_COPY = {
  deferred: "Action not completed. Your plan may need adjustment.",
  overloaded: "This week may be carrying more than fits — let's find the next workable action.",
  tooLarge: "This task may be too large for your current schedule.",
  noChange: "No measurable change yet from this action.",
} as const;
