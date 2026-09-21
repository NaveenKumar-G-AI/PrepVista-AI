// Mirrors the shapes returned by the Feature 44 API
// (../../src/domain/types.ts on the backend). Kept as a hand-written
// subset rather than a shared package, since this is a standalone
// reference implementation - wire a shared types package when this
// integrates into the real ACEAPT monorepo.

export type PriorityTarget = "quant" | "logical" | "verbal" | "probability" | "data_interpretation" | "speed" | "accuracy";

export interface PriorityScoreBreakdown {
  target: PriorityTarget;
  goalRelevance: number;
  normalizedGap: number;
  assessmentRelevance: number;
  learningOpportunity: number;
  score: number;
  reason: string;
}

export interface GapSize {
  dimension: string;
  current: number | null;
  target: number | null;
  gap: number | null;
  classification: "NONE" | "SMALL" | "MODERATE" | "LARGE" | "UNKNOWN";
}

export interface DimensionalGap {
  capability: GapSize[];
  accuracyGap: { current: number | null; target: number | null; gap: number | null } | null;
  speedGap: { current: string | null; target: string | null; met: boolean | null } | null;
  consistencyGap: { current: number | null; target: number | null; gap: number | null } | null;
  unsupported: string[];
}

export interface Goal {
  id: string;
  studentId: string;
  goalType: string;
  title: string;
  description: string | null;
  status: "ACTIVE" | "PAUSED" | "COMPLETED" | "ABANDONED";
  deadlineType: "EXACT_DATE" | "DAYS_FROM_NOW" | "NONE" | "UNKNOWN";
  targetDate: string | null;
  availableTime: Record<string, number>;
  targetCapability: Record<string, number>;
  targetAccuracy: number | null;
  targetSpeedBand: string | null;
  gapSnapshot: DimensionalGap;
  prioritySnapshot: PriorityScoreBreakdown[];
  health: "HEALTHY" | "IMPROVING" | "NEEDS_ATTENTION" | "AT_RISK" | "PAUSED" | "COMPLETED";
  healthReason: string | null;
  feasibility: "ON_TRACK" | "CHALLENGING" | "HIGHLY_CONSTRAINED" | "INSUFFICIENT_EVIDENCE" | null;
  confidence: "LOW" | "MODERATE" | "HIGH";
  progress: number;
  studentMarkedComplete: boolean;
  systemVerifiedComplete: boolean;
  createdAt: string;
}

export interface GoalMilestone {
  id: string;
  goalId: string;
  title: string;
  description: string | null;
  sequence: number;
  status: "UPCOMING" | "ACTIVE" | "ACHIEVED";
  evidenceRequired: string;
}

export interface GoalView {
  goal: Goal;
  milestones: GoalMilestone[];
  alreadyAtOrAboveTarget: boolean;
  daysRemaining: number | null;
}

export interface GoalDraft {
  source: "AI" | "FALLBACK";
  goalType: string | null;
  deadlineDays: number | null;
  deadlineExactDate: string | null;
  studentReportedWeakness: string | null;
  weaknessDimension: string | null;
  notes: string | null;
  needsClarification: string[];
}
