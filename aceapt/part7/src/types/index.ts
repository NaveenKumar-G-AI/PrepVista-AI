// ============================================================================
// Feature 7 — Core Domain Types
// Mirrors PLAN §5 (action types), §34 (action object shape), §37 (data model)
// ============================================================================

export type SkillId = string;
export type StudentId = string;

// ---- §5 ACTION TYPES -------------------------------------------------------
export enum ActionType {
  LEARN = 'LEARN',
  REVISE = 'REVISE',
  PRACTICE = 'PRACTICE',
  TIMED_PRACTICE = 'TIMED_PRACTICE',
  ERROR_REPAIR = 'ERROR_REPAIR',
  MIXED_PRACTICE = 'MIXED_PRACTICE',
  STRATEGY_TRAINING = 'STRATEGY_TRAINING',
  REASSESS = 'REASSESS',
  MAINTAIN = 'MAINTAIN',
  RESTORE = 'RESTORE',
}

export enum Priority {
  CRITICAL = 'CRITICAL',
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
}

export enum Confidence {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export enum ActionStatus {
  RECOMMENDED = 'RECOMMENDED',
  STARTED = 'STARTED',
  COMPLETED = 'COMPLETED',
  SKIPPED = 'SKIPPED',
  EXPIRED = 'EXPIRED',
  REPLACED = 'REPLACED',
}

export enum GoalType {
  IMPROVE_APTITUDE = 'IMPROVE_APTITUDE',
  BECOME_ASSESSMENT_READY = 'BECOME_ASSESSMENT_READY',
  IMPROVE_QUANTITATIVE = 'IMPROVE_QUANTITATIVE',
  INCREASE_SPEED = 'INCREASE_SPEED',
  REACH_READINESS_THRESHOLD = 'REACH_READINESS_THRESHOLD',
  PREPARE_FOR_ASSESSMENT = 'PREPARE_FOR_ASSESSMENT',
}

// §29 self-reflection tags (optional, never overrides objective data — §29)
export enum SkipReason {
  TOO_DIFFICULT = 'TOO_DIFFICULT',
  TOO_EASY = 'TOO_EASY',
  NOT_ENOUGH_TIME = 'NOT_ENOUGH_TIME',
  DIDNT_UNDERSTAND = 'DIDNT_UNDERSTAND',
  CARELESS_MISTAKES = 'CARELESS_MISTAKES',
  FELT_UNSURE = 'FELT_UNSURE',
  TECHNICAL_ISSUE = 'TECHNICAL_ISSUE',
  NOT_STATED = 'NOT_STATED',
}

export type ProblemType =
  | 'CONCEPT_GAP'
  | 'UNSTABLE_KNOWLEDGE'
  | 'WEAK_EXECUTION'
  | 'SPEED_GAP'
  | 'ERROR_PATTERN'
  | 'MIXED_PERFORMANCE_GAP'
  | 'STRATEGY_GAP'
  | 'READY_TO_VERIFY'
  | 'STABLE_STRENGTH'
  | 'REGRESSION';

// ---- Evidence coming from Feature 6 (assessment / exam simulation) --------
export interface SkillEvidence {
  student_id: StudentId;
  skill_id: SkillId;
  skill_name: string;
  category: string; // e.g. Quantitative / Logical / Verbal
  concept_mastery: number; // 0-100
  accuracy: number; // 0-100 overall
  untimed_accuracy?: number; // 0-100
  timed_accuracy?: number; // 0-100
  avg_solving_time_sec: number;
  target_solving_time_sec: number;
  consistency: number; // 0-100
  mixed_topic_accuracy?: number; // 0-100, accuracy when this skill appears in a mixed set
  error_tags: string[]; // e.g. ["calculation_slip", "wrong_method"]
  attempts: number;
  historical_peak_accuracy?: number; // for §17 regression detection
  updated_at: string;
}

export interface ReadinessSnapshot {
  id: string;
  student_id: StudentId;
  readiness: number; // 0-100
  taken_at: string;
  source: 'ASSESSMENT' | 'MINI_ASSESSMENT' | 'CALCULATED';
  driver_action_id?: string; // action that led to this snapshot, if any
}

// ---- §37 DATA MODEL ---------------------------------------------------------
export interface StudentGoal {
  id: string;
  student_id: StudentId;
  goal_type: GoalType;
  target?: number;
  deadline?: string;
  status: 'ACTIVE' | 'ACHIEVED' | 'EXPIRED';
  created_at: string;
}

export interface ActionEvidenceNote {
  label: string;
  value: string;
}

// §34 structured action object
export interface StudentAction {
  id: string;
  student_id: StudentId;
  action_type: ActionType;
  target_skill: SkillId;
  target_skill_name: string;
  target_error?: string;
  priority: Priority;
  priority_score: number;
  reason: string;
  why_this: string;
  duration_minutes: number;
  expected_outcome: string;
  required_feature: 'FEATURE_5' | 'FEATURE_6';
  success_metric: string;
  verification_method: string;
  evidence: ActionEvidenceNote[];
  confidence: Confidence;
  status: ActionStatus;
  skip_reason?: SkipReason;
  session_ref?: string; // handle returned by Feature 5 / Feature 6 client
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

export interface ActionOutcome {
  id: string;
  action_id: string;
  student_id: StudentId;
  before_metrics: Record<string, number>;
  after_metrics: Record<string, number>;
  effectiveness: 'EFFECTIVE' | 'PARTIALLY_EFFECTIVE' | 'NOT_EFFECTIVE' | 'PENDING';
  confidence: Confidence;
  notes?: string;
  created_at: string;
}

export interface Milestone {
  id: string;
  student_id: StudentId;
  objective: string;
  target_skill?: SkillId; // if unset, tracks overall readiness
  target: number;
  progress: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETE';
  order: number;
  completed_at?: string;
}

// ---- Internal problem-detection output (feeds the priority engine) --------
export interface ProblemSignal {
  skill_id: SkillId;
  skill_name: string;
  category: string;
  problem_type: ProblemType;
  severity: number; // 0-100
  frequency: number; // 0-100 — how often this shows up across attempts
  readiness_relevance: number; // 0-100 — weight of this skill/category toward readiness
  improvement_opportunity: number; // 0-100 — headroom available
  confidence: Confidence;
  details: string;
}

export interface Student {
  id: StudentId;
  name: string;
}
