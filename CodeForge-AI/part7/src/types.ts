// Mirrors db/migrations/002_assessment_engine.sql enums exactly.
// Keep these in lockstep with the SQL — there is deliberately no ORM
// generating one from the other in this reference implementation.

export type AssessmentType =
  | 'diagnostic'
  | 'skill_verification'
  | 'milestone_assessment'
  | 'role_readiness'
  | 'interview_simulation'
  | 'placement_assessment'
  | 'custom';

export type AssessmentStatus =
  | 'created' | 'ready' | 'started' | 'in_progress' | 'paused'
  | 'submitted' | 'evaluating' | 'completed' | 'expired' | 'cancelled' | 'failed';

export type AssistanceLevel = 'none' | 'limited' | 'hints_allowed' | 'full_practice_assistance';
export type EvidenceLevel = 'direct_evidence' | 'inferred_evidence' | 'insufficient_evidence';
export type PerformanceLevel = 'insufficient_evidence' | 'weak' | 'developing' | 'competent' | 'strong';
export type ReadinessState = 'not_started' | 'foundation_building' | 'developing' | 'approaching_ready' | 'ready' | 'strong';
export type ReadinessConfidence = 'low' | 'medium' | 'high';
export type SubmissionStatus = 'passed' | 'failed' | 'runtime_error' | 'timeout' | 'compile_error';
export type MasteryLevel = 'unknown' | 'weak' | 'developing' | 'competent' | 'strong';
export type EvidenceQuality = 'none' | 'inferred' | 'direct';
export type DifficultyLevel = 'easy' | 'medium' | 'hard';
export type SupportedLanguage = 'python' | 'javascript' | 'java' | 'cpp';

// Valid state machine transitions (section 16). Anything not listed here is
// rejected by sessionService with INVALID_STATE_TRANSITION.
export const VALID_TRANSITIONS: Record<AssessmentStatus, AssessmentStatus[]> = {
  created: ['ready', 'cancelled'],
  ready: ['started', 'cancelled', 'expired'],
  started: ['in_progress', 'expired', 'cancelled'],
  in_progress: ['paused', 'submitted', 'expired', 'cancelled'],
  paused: ['in_progress', 'expired', 'cancelled'],
  submitted: ['evaluating', 'failed'],
  evaluating: ['completed', 'failed'],
  completed: [],
  expired: [],
  cancelled: [],
  failed: [],
};

export interface CompetencyWeight {
  skill_id: string;
  skill_name?: string;
  weight: number;
}

export interface DifficultyDistribution {
  easy: number;
  medium: number;
  hard: number;
}

export interface ReadinessGates {
  min_performance_level: PerformanceLevel; // per-skill bar to count as "met"
  min_weighted_score_for_ready: number; // 0..1
  min_weighted_score_for_approaching: number; // 0..1
  min_weighted_score_for_developing: number; // 0..1
  max_insufficient_evidence_skills_for_ready: number;
}

export interface AppError extends Error {
  code: string;
  httpStatus: number;
}

export function appError(code: string, message: string, httpStatus = 400): AppError {
  const err = new Error(message) as AppError;
  err.code = code;
  err.httpStatus = httpStatus;
  return err;
}
