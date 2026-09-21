// Core domain types for ACEAPT RECALL.
//
// IMPORTANT CONTEXT: no existing ACEAPT codebase was provided to audit
// (see root README). These types are therefore a standalone reference
// model, deliberately kept close to what the master spec describes so
// they're easy to map onto real Student / Skill / Assessment entities
// later. Every place that would normally reuse an existing system
// (auth, question bank, error taxonomy) is called out in a comment.

export type QuestionType = 'recognition' | 'recall' | 'application' | 'transfer';

export type Difficulty = 'easy' | 'medium' | 'hard';

export type EvidenceSource =
  | 'initial_assessment'
  | 'practice'
  | 'mixed_practice'
  | 'retrieval_check'
  | 'delayed_recall'
  | 'timed_assessment'
  | 'transfer_question'
  | 'recovery_step'
  | 'recovery_immediate_verification'
  | 'recovery_delayed_verification';

/**
 * Sources that count as "checked again after time had passed", as opposed
 * to evidence generated in the middle of learning or practicing something
 * for the first time. This single distinction is what lets the engine
 * separate MASTERY (could they do it at all) from RETENTION (can they
 * still do it later) — see retentionEngine.ts.
 */
export const DELAYED_SOURCES: ReadonlySet<EvidenceSource> = new Set([
  'mixed_practice',
  'retrieval_check',
  'delayed_recall',
  'timed_assessment',
  'transfer_question',
  'recovery_delayed_verification',
]);

export interface RetentionEvidence {
  id: string;
  studentId: string;
  skillId: string;
  conceptId?: string;
  timestamp: string; // ISO 8601
  source: EvidenceSource;
  difficulty: Difficulty;
  questionType: QuestionType;
  performance: number; // 0..1, fraction correct for this observation
  timeTakenSeconds?: number;
  targetRelevance?: number; // 0..1, optional override; usually derived from StudentTarget
  /** Optional free-form tag such as 'calculation_error'. In a real ACEAPT
   *  integration this should be replaced by the existing error taxonomy
   *  (see spec section 33) rather than a duplicate tagging scheme. */
  context?: string;
}

/**
 * Full state set the spec enumerates. The vertical slice actively
 * transitions through RECENTLY_LEARNED / STABLE / DECAYING / AT_RISK /
 * FORGOTTEN / RECOVERING. LEARNING, REINFORCED and MASTERED are reserved
 * for integration with the (not-yet-audited) learning and mastery
 * systems — kept in the enum so downstream consumers can rely on the
 * full contract without this slice inventing fake data for them.
 */
export type MemoryStateName =
  | 'NOT_LEARNED'
  | 'LEARNING'
  | 'RECENTLY_LEARNED'
  | 'STABLE'
  | 'DECAYING'
  | 'AT_RISK'
  | 'FORGOTTEN'
  | 'RECOVERING'
  | 'REINFORCED'
  | 'MASTERED';

export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type Trend = 'IMPROVING' | 'DECLINING' | 'STABLE' | 'INSUFFICIENT_DATA';

export type FailureType =
  | 'CONCEPT_FAILURE' // doesn't remember the concept/method at all
  | 'RETRIEVAL_FAILURE' // recognizes it, can't produce it unaided
  | 'APPLICATION_FAILURE' // knows the method, doesn't know when to use it
  | 'EXECUTION_FAILURE' // method is right, careless execution errors
  | 'TRANSFER_FAILURE' // fine on familiar form, fails novel variations
  | 'NONE';

export type InterventionType =
  | 'MICRO_EXPLANATION'
  | 'WORKED_EXAMPLE'
  | 'ACTIVE_RECALL'
  | 'TARGETED_PRACTICE'
  | 'CONTRAST_QUESTIONS'
  | 'APPLICATION_PRACTICE'
  | 'TRANSFER_QUESTION'
  | 'TIMED_RETRIEVAL';

export type RecoverySessionStatus =
  | 'IN_PROGRESS'
  | 'AWAITING_DELAYED_VERIFICATION'
  | 'VERIFIED_STABLE'
  | 'VERIFICATION_FAILED';

export interface RecoverySession {
  id: string;
  studentId: string;
  skillId: string;
  createdAt: string;
  failureType: FailureType;
  interventionType: InterventionType;
  escalationLevel: number;
  status: RecoverySessionStatus;
  beforeScore: number | null; // most recent decayed performance prior to this session
  immediateScore: number | null;
  delayedScore: number | null;
  delayedVerificationAt: string | null;
}

export interface RetentionTransition {
  studentId: string;
  skillId: string;
  from: MemoryStateName | null;
  to: MemoryStateName;
  timestamp: string;
  reason: string;
}

export interface RetentionAssessment {
  studentId: string;
  skillId: string;
  masteryScore: number | null; // 0..1 — derived from learning-phase evidence
  retentionScore: number | null; // 0..1 — derived from delayed-check evidence only
  memoryState: MemoryStateName;
  confidence: ConfidenceLevel;
  retentionRisk: number | null; // 0..1 heuristic, never presented as certainty
  trend: Trend;
  recurringWeakness: boolean;
  escalationLevel: number;
  lastEvidenceAt: string | null;
  evidenceCount: number;
  delayedEvidenceCount: number;
  currentRecoveryStatus: RecoverySessionStatus | null;
  explanationKey: string;
}

export interface SkillMeta {
  id: string;
  name: string;
  category: string;
}

export interface StudentTarget {
  studentId: string;
  name: string;
  skillImportance: Record<string, number>; // skillId -> 0..1
  upcomingAssessmentInDays?: number;
  criticalSkillIds?: string[];
}
