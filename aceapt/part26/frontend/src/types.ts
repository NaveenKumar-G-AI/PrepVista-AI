/**
 * Slimmed-down mirror of the backend's DTOs (backend/src/types.ts) - only
 * the shapes the UI actually reads. In a real monorepo these would be
 * generated from/shared with the backend package instead of hand-kept in
 * sync; noted here as a follow-up rather than done, to keep this MVP's
 * moving parts to a minimum.
 */

export type BottleneckType =
  | "CONCEPT_GAP"
  | "RETENTION_DECAY"
  | "TRANSFER_GAP"
  | "METHOD_ERROR"
  | "SPEED_LIMIT"
  | "LOW_EVIDENCE"
  | "PREREQUISITE_GAP"
  | "STABLE";

export type ActionType =
  | "LEARN"
  | "REVIEW"
  | "RECALL"
  | "PRACTICE"
  | "TRANSFER_CHALLENGE"
  | "METHOD_REPAIR"
  | "VERIFY"
  | "MIX"
  | "CHALLENGE"
  | "TIMED_PRACTICE"
  | "ASSESS"
  | "REST";

export interface TopicCapabilityState {
  topicId: string;
  topicName: string;
  mastery: number | null;
  retention: number | null;
  transfer: number | null;
  accuracy: number | null;
  speed: number | null;
  consistency: number | null;
  momentum: "IMPROVING" | "DECLINING" | "FLAT" | "UNKNOWN";
  momentumTrendNote: string | null;
  stability: "STABLE" | "UNSTABLE" | "UNKNOWN";
  regressionSuspected: boolean;
  regressionPossibleCauses: string[];
  confidence: "LOW" | "MEDIUM" | "HIGH";
  persistentErrorPattern: string | null;
  sampleSize: number;
}

export interface PriorityBreakdownTerm {
  factor: string;
  rawValue: number;
  weight: number;
  contribution: number;
  note: string;
}

export interface CandidateAction {
  id: string;
  topicId: string;
  topicName: string;
  actionType: ActionType;
  bottleneck: BottleneckType;
  estimatedMinutes: number;
  expectedImpact: number;
  priorityScore: number;
  priorityBreakdown: PriorityBreakdownTerm[];
  rationale: string[];
}

export interface PlanItem {
  order: number;
  action: CandidateAction;
}

export interface AdaptivePlan {
  totalMinutes: number;
  remainingMinutes: number;
  items: PlanItem[];
  unusedMinutes: number;
  allStable: boolean;
  exceedsBudget: boolean;
}

export interface NextActionExplanation {
  what: string;
  why: string;
  time: string;
  expectedValue: "LOW" | "MEDIUM" | "HIGH";
  source: "deterministic" | "ai-enhanced";
}

export interface NextActionResponse {
  action: CandidateAction | null;
  explanation: NextActionExplanation | null;
  allStable: boolean;
}

export interface PlanResponse {
  plan: AdaptivePlan;
  fatigueSuspected: boolean;
  fatigueMessage?: string;
}

export interface ContentItemPublic {
  id: string;
  topicId: string;
  prompt: string;
  options: string[];
  difficulty: "EASY" | "MEDIUM" | "MEDIUM_HARD" | "HARD";
}

export interface StartActionResponse {
  executionId: string;
  items: ContentItemPublic[];
}

export interface GradeResult {
  correctCount: number;
  totalCount: number;
  accuracy: number;
  avgResponseTimeSeconds: number;
}

export interface CompleteActionResponse {
  grade: GradeResult;
  states: TopicCapabilityState[];
  next: NextActionResponse;
  plan: PlanResponse | null;
}

export interface AdaptationEvent {
  id: string;
  type: string;
  summary: string;
  at: string;
}
