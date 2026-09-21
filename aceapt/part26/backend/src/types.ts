/**
 * Shared domain types for the ACEAPT Adapt engine (Feature 26).
 *
 * These are intentionally new, narrow types rather than a rewrite of
 * PrepVista's real student/skill/mastery models (section 40 of the master
 * prompt: "reuse existing ... entities wherever appropriate"). Nothing in
 * this codebase has access to those real models, so this file plays the
 * role they would play, behind the RawTopicEvidence boundary in
 * src/db/store.ts + src/db/seed.ts. Swap that boundary for real calls into
 * mastery/retention/transfer services and everything downstream (engine,
 * routes, frontend) keeps working unchanged.
 */

export type TopicId = string;

/** What an "existing system" (mastery/retention/transfer/attempt history)
 *  would hand ACEAPT Adapt about one topic for one student. */
export interface RawTopicEvidence {
  topicId: TopicId;
  topicName: string;
  mastery: number | null; // 0-100
  retention: number | null; // 0-100
  transfer: number | null; // 0-100, null = not yet evidenced
  accuracy: number | null; // 0-100
  speed: number | null; // 0-100, higher = faster relative to expected time
  consistency: number | null; // 0-100
  /** Chronological (oldest -> newest) overall performance scores, 0-100. */
  recentScores: number[];
  /** Rolling log of tags attached to recent incorrect answers, oldest -> newest. */
  errorTags: string[];
  lastPracticedAt: string | null; // ISO date
  /** How many attempts/sessions back this evidence - drives confidence. */
  sampleSize: number;
  /** 0-1, how relevant this topic is to the student's current goal. */
  goalRelevance: number;
  prerequisiteTopicIds: TopicId[];
}

export type EvidenceConfidence = "LOW" | "MEDIUM" | "HIGH";
export type Momentum = "IMPROVING" | "DECLINING" | "FLAT" | "UNKNOWN";
export type Stability = "STABLE" | "UNSTABLE" | "UNKNOWN";

export interface TopicCapabilityState {
  topicId: TopicId;
  topicName: string;
  mastery: number | null;
  retention: number | null;
  transfer: number | null;
  accuracy: number | null;
  speed: number | null;
  consistency: number | null;
  momentum: Momentum;
  momentumTrendNote: string | null;
  stability: Stability;
  regressionSuspected: boolean;
  regressionPossibleCauses: string[];
  confidence: EvidenceConfidence;
  persistentErrorPattern: string | null;
  persistentErrorSeverity: number;
  goalRelevance: number;
  prerequisiteTopicIds: TopicId[];
  sampleSize: number;
  lastPracticedAt: string | null;
}

export type BottleneckType =
  | "CONCEPT_GAP"
  | "RETENTION_DECAY"
  | "TRANSFER_GAP"
  | "METHOD_ERROR"
  | "SPEED_LIMIT"
  | "LOW_EVIDENCE"
  | "PREREQUISITE_GAP"
  | "STABLE";

export interface Diagnosis {
  topicId: TopicId;
  topicName: string;
  bottleneck: BottleneckType;
  severity: number; // 0-1
  confidence: EvidenceConfidence;
  notes: string[];
  /** Set only for PREREQUISITE_GAP: the upstream topic to address instead. */
  redirectTopicId?: TopicId;
  redirectTopicName?: string;
}

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

export interface PriorityBreakdownTerm {
  factor: string;
  rawValue: number;
  weight: number;
  contribution: number;
  note: string;
}

export interface CandidateAction {
  /** Stable within one planning cycle: `${topicId}::${actionType}` */
  id: string;
  topicId: TopicId;
  topicName: string;
  actionType: ActionType;
  bottleneck: BottleneckType;
  severity: number; // 0-1, carried over from the diagnosis that produced this
  estimatedMinutes: number;
  expectedImpact: number; // 0-1
  expectedValuePerMinute: number; // expectedImpact / estimatedMinutes
  priorityScore: number; // 0-1, transparent weighted score
  priorityBreakdown: PriorityBreakdownTerm[];
  rationale: string[];
}

export interface PlanItem {
  order: number;
  action: CandidateAction;
}

export interface AdaptivePlan {
  studentId: string;
  totalMinutes: number;
  remainingMinutes: number;
  items: PlanItem[];
  unusedMinutes: number;
  generatedAt: string;
  allStable: boolean;
  /** True when the single highest-priority action needed more time than was
   *  available and got included anyway, rather than being dropped in favor
   *  of an unrelated filler action (see plan.ts). */
  exceedsBudget: boolean;
}

export type ExpectedValueBand = "LOW" | "MEDIUM" | "HIGH";

export interface NextActionExplanation {
  what: string;
  why: string;
  time: string;
  expectedValue: ExpectedValueBand;
  source: "deterministic" | "ai-enhanced";
}

export interface ContentItem {
  id: string;
  topicId: TopicId;
  prompt: string;
  options: string[];
  correctIndex: number;
  difficulty: "EASY" | "MEDIUM" | "MEDIUM_HARD" | "HARD";
}

export type ContentItemPublic = Omit<ContentItem, "correctIndex">;

export interface SubmittedAnswer {
  itemId: string;
  selectedIndex: number;
  responseTimeSeconds: number;
}

export type AdaptationEventType =
  | "CAPABILITY_UPDATED"
  | "ADAPTATION_TRIGGERED"
  | "CANDIDATE_ACTIONS_GENERATED"
  | "PRIORITIZATION_COMPLETED"
  | "NEXT_ACTION_SELECTED"
  | "PLAN_GENERATED"
  | "ACTION_STARTED"
  | "ACTION_COMPLETED"
  | "ACTION_SKIPPED"
  | "RESULT_ANALYZED"
  | "PLAN_RECOMPUTED";

export interface AdaptationEvent {
  id: string;
  studentId: string;
  type: AdaptationEventType;
  summary: string;
  detail?: Record<string, unknown>;
  at: string; // ISO
}

export interface PendingExecution {
  executionId: string;
  studentId: string;
  candidateActionId: string;
  topicId: TopicId;
  topicName: string;
  actionType: ActionType;
  bottleneck: BottleneckType;
  estimatedMinutes: number;
  items: ContentItem[];
  startedAt: string;
}

export interface SessionActionResult {
  topicId: string;
  accuracy: number; // 0-1
  avgResponseTimeSeconds: number;
  at: string;
}

export interface PlanSessionRecord {
  studentId: string;
  totalMinutes: number;
  remainingMinutes: number;
  completedTopicIds: TopicId[];
  skippedTopicIds: TopicId[];
  startedAt: string;
  lastActionResults: SessionActionResult[];
}

export interface ActionGradeResult {
  correctCount: number;
  totalCount: number;
  accuracy: number; // 0-1
  avgResponseTimeSeconds: number;
}
