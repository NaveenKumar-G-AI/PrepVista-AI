// ============================================================================
// ACEAPT AI — Feature 19: Retention, Forgetting & Reinstatement Engine
// Domain types
//
// These types belong to Feature 19 only. They deliberately do NOT redefine
// Student, Concept, Question, or Mastery — those already exist in the real
// ACEAPT system (student model, Feature 14, Feature 17). Feature 19
// references them only by id (studentId, conceptId) and reads what it needs
// through the integration ports in `src/integration/featurePorts.ts`.
// ============================================================================

/** Forward progression. A concept only moves up this list by earning it. */
export type KnowledgeStage =
  | 'EXPOSED'
  | 'UNDERSTOOD'
  | 'PRACTICED'
  | 'MASTERED'
  | 'RETAINED'
  | 'TRANSFERABLE'
  | 'EXAM_READY';

export const KNOWLEDGE_STAGE_ORDER: KnowledgeStage[] = [
  'EXPOSED', 'UNDERSTOOD', 'PRACTICED', 'MASTERED', 'RETAINED', 'TRANSFERABLE', 'EXAM_READY',
];

/**
 * The regression / risk track — separate from stage. Product states, not
 * psychological labels: they describe what ACEAPT should do next, not what
 * is happening inside the student's head.
 */
export type RetentionRiskState =
  | 'STABLE'
  | 'MONITOR'
  | 'WEAKENING'
  | 'AT_RISK'
  | 'REACTIVATION_REQUIRED'
  | 'INACCESSIBLE';

/** Ordinal severity, used for prioritization — not shown to students. */
export const RISK_SEVERITY: Record<RetentionRiskState, number> = {
  STABLE: 0,
  MONITOR: 1,
  WEAKENING: 2,
  AT_RISK: 3,
  REACTIVATION_REQUIRED: 4,
  INACCESSIBLE: 5,
};

export const RISK_STATE_ORDER: RetentionRiskState[] = [
  'STABLE', 'MONITOR', 'WEAKENING', 'AT_RISK', 'REACTIVATION_REQUIRED', 'INACCESSIBLE',
];

/**
 * Qualitative first, numeric second — and only when there's enough evidence
 * to justify a number. See engine/retentionStrength.ts.
 */
export type RetentionStrengthBand = 'STRONG' | 'MODERATE' | 'WEAK' | 'INSUFFICIENT_EVIDENCE';

export type RetrievalMode = 'micro' | 'blind' | 'contrastive' | 'mixed' | 'transfer' | 'standard';

export type DifficultyBand = 'easy' | 'medium' | 'hard';

/** The "dressing" a question came in — the raw material for diversity scoring. */
export interface ContextExposure {
  templateId: string;
  difficultyBand: DifficultyBand;
  method: string;
  topicWrapper: string;
  timed: boolean;
}

/**
 * One graded retrieval event. Feature 19 does not grade answers — the
 * caller (Feature 17 / whatever ran the question) reports the outcome in.
 * Feature 19's job starts after `correct` is already known.
 */
export interface RetrievalAttempt {
  id: string;
  studentId: string;
  conceptId: string;
  sessionId: string;
  mode: RetrievalMode;
  correct: boolean;
  latencyMs: number;
  hintsUsed: number;
  explanationRequested: boolean;
  confidenceSelfReport?: 1 | 2 | 3 | 4 | 5;
  /** Only meaningful for mode: 'blind' — did the student name the right concept? */
  identifiedConceptCorrectly?: boolean;
  context: ContextExposure;
  createdAt: string; // ISO-8601
}

/** The persisted, per-student-per-concept state. One row per pair. */
export interface KnowledgeState {
  studentId: string;
  conceptId: string;
  stage: KnowledgeStage;
  riskState: RetentionRiskState;
  strengthBand: RetentionStrengthBand;
  /** Present only once evidenceSufficiency clears the threshold. Internal-use; UIs should prefer strengthBand. */
  strengthScore?: number;
  /** 0–1: how much this state should be trusted. Low right after mastery, grows with varied evidence. */
  evidenceSufficiency: number;
  lastSuccessAt: string | null;
  masteredAt: string | null;
  lastEvaluatedAt: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * A computed/derived view, not a separate source of truth. Built on demand
 * from RetrievalAttempt history — see engine/evidence.ts. Kept here as a
 * type because callers (API responses, the demo) need a stable shape for it.
 */
export interface RetentionEvidence {
  studentId: string;
  conceptId: string;
  attemptCount: number;
  distinctContexts: number;
  contextDiversityScore: number; // 0–1, entropy-based
  delayDaysSinceLastSuccess: number | null;
  recentSuccessRate: number | null;
  baselineSuccessRate: number | null;
  transferSuccessRate: number | null;
  timedSuccessRate: number | null;
  untimedSuccessRate: number | null;
  timedAttemptCount: number;
  untimedAttemptCount: number;
  timedVsUntimedGap: number | null; // untimed − timed; positive = weaker under pressure
  hintDependencyRate: number;
  explanationDependencyRate: number;
  reactivationSuccessRate: number | null;
}

export interface RecallSession {
  id: string;
  studentId: string;
  type:
    | 'today_memory_check'
    | 'single_concept_check'
    | 'mixed_retention'
    | 'contrastive_recall'
    | 'blind_retrieval';
  conceptIds: string[];
  startedAt: string;
  completedAt: string | null;
  attemptIds: string[];
}

export type ReactivationLevel = 1 | 2 | 3 | 4 | 5;

export interface ReactivationStep {
  level: ReactivationLevel;
  kind:
    | 'recall_prompt'
    | 'small_hint'
    | 'concept_reminder'
    | 'guided_solve'
    | 'targeted_lesson'
    | 'similar_question'
    | 'transfer_question';
  attemptId?: string;
  succeeded?: boolean;
  timestamp: string;
}

export interface ReactivationSession {
  id: string;
  studentId: string;
  conceptId: string;
  startedAt: string;
  completedAt: string | null;
  currentLevel: ReactivationLevel;
  outcome: 'in_progress' | 'retained_again' | 'escalated' | 'abandoned';
  steps: ReactivationStep[];
}

export interface ReviewPlanItem {
  conceptId: string;
  priorityScore: number; // heuristic 0–1, relative "review this now" ranking
  reason: RetentionRiskState;
}

export interface ReviewPlan {
  studentId: string;
  generatedAt: string;
  items: ReviewPlanItem[];
  estimatedMinutes: number;
}

export interface ConceptDependency {
  conceptId: string;
  prerequisiteIds: string[];
}

export interface DashboardBandCounts {
  strong: number;
  stable: number;
  weakening: number;
  needsRecall: number;
  total: number;
}
