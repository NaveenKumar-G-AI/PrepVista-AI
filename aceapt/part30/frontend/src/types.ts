export type MilestoneStatus = "LOCKED" | "AVAILABLE" | "IN_PROGRESS" | "NEEDS_IMPROVEMENT" | "VERIFIED" | "MASTERED";
export type StageStatus = "LOCKED" | "ACTIVE" | "COMPLETE";
export type PathMode = "FAST_TRACK" | "STANDARD" | "DEEP_MASTERY" | "RECOVERY" | "REASSESSMENT";
export type ActionType = "LEARN" | "PRACTICE" | "REVISE" | "RETEST" | "TRANSFER" | "SIMULATE" | "PROVE" | "REFLECT";
export type RiskSeverity = "LOW" | "MEDIUM" | "HIGH";

export interface PathStage {
  id: string;
  key: string;
  name: string;
  sequence: number;
  status: StageStatus;
}

export interface EvidenceRequirement {
  capabilityCode: string;
  dimension: "accuracy" | "speed" | "transfer" | "consistency" | "level";
  minValue: number;
  minEvidenceCount: number;
}

export interface PathMilestone {
  id: string;
  stageId: string;
  name: string;
  requiredCapabilities: string[];
  evidenceRequirements: EvidenceRequirement[];
  status: MilestoneStatus;
  priority: number;
  critical: boolean;
  verifiedAt: string | null;
}

export interface PathAction {
  id: string;
  pathId: string;
  milestoneId: string | null;
  type: ActionType;
  capabilityCode: string;
  reason: string;
  status: string;
}

export interface NextBestAction {
  action: PathAction;
  headline: string;
  why: string;
}

export interface Bottleneck {
  capabilityCode: string;
  capabilityName: string;
  dimension: "accuracy" | "speed" | "transfer" | "consistency";
  currentValue: number;
  targetRequirement: number;
  gap: number;
  evidence: { accuracy: number; speed: number; transfer: number; consistency: number; evidenceCount: number };
  explanation: string;
}

export interface ReadinessDimension {
  key: "capability" | "application" | "transfer" | "proof";
  label: string;
  current: number;
  target: number;
  gapContribution: number;
}

export interface PathRisk {
  id: string;
  type: string;
  reason: string;
  severity: RiskSeverity;
  recommendedResponse: string;
  detectedAt: string;
}

export interface ReadinessProjection {
  windowLabel: string;
  weeksLow: number | null;
  weeksHigh: number | null;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  basis: string;
}

export interface PathChangeExplanation {
  reason: string;
  summary: string;
  previousBottleneck: string | null;
  newBottleneck: string | null;
  occurredAt: string;
}

export interface PathState {
  id: string;
  studentId: string;
  targetId: string;
  slot: "PRIMARY" | "SECONDARY" | "STRETCH";
  mode: PathMode;
  status: string;
  readiness: number;
  targetReadiness: number;
  deadlineDays: number | null;
  lastRecalculatedAt: string;
}

export interface Target {
  id: string;
  code: string;
  name: string;
  description: string;
}

export interface PathDashboard {
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
  evidenceCoverage: number;
}

export interface EmptyStateResponse {
  empty: true;
  message: string;
  detail?: string;
  action?: string;
}

export interface WeeklyReview {
  weekStart: string;
  weekEnd: string;
  readinessDelta: number | null;
  capabilityDelta: number | null;
  milestonesVerified: number;
  bottleneck: string | null;
  nextFocus: string;
}

export interface PathHistoryEvent {
  eventType: string;
  reason: string | null;
  summary: string | null;
  createdAt: string;
}

export interface PathSnapshot {
  id: string;
  stageKey: string;
  readiness: number;
  bottleneckCapability: string | null;
  takenAt: string;
}

export interface TargetComparison {
  sharedCapabilities: string[];
  uniqueToCurrent: string[];
  uniqueToNew: string[];
  transferablePercent: number;
}
