// Core domain types for Feature 35 — Career Conversion & Failure-Recovery Intelligence.
// These are intentionally close to the conceptual entities in the brief (Section 31),
// scoped to what P0 actually needs. Treat this file as the contract between the
// deterministic engines, the API routes, and the UI.

export type StageKey =
  | 'application'
  | 'response'
  | 'interview'
  | 'technical_round'
  | 'behavioral_round'
  | 'final_round'
  | 'offer';

export const STAGE_ORDER: StageKey[] = [
  'application',
  'response',
  'interview',
  'technical_round',
  'behavioral_round',
  'final_round',
  'offer',
];

export type StageStatus = 'passed' | 'rejected' | 'withdrawn' | 'offer_received' | 'pending';

export type TargetAlignment = 'aligned' | 'partial' | 'misaligned' | 'unknown';

export type FailureCategory =
  | 'TARGET_MISMATCH'
  | 'APPLICATION_MISMATCH'
  | 'ELIGIBILITY_MISMATCH'
  | 'TECHNICAL_PERFORMANCE'
  | 'COMMUNICATION_PERFORMANCE'
  | 'BEHAVIORAL_INTERVIEW'
  | 'PROJECT_EXPERIENCE_EVIDENCE'
  | 'INTERVIEW_PERFORMANCE'
  | 'ROLE_SPECIFIC_KNOWLEDGE'
  | 'PREPARATION_GAP'
  | 'OPPORTUNITY_FIT'
  | 'EXTERNAL_UNKNOWN';

export type Controllability = 'high' | 'moderate' | 'low';

export type EvidenceType = 'DIRECT_EVIDENCE' | 'POSSIBLE_CONTRIBUTOR';
export type EvidenceSource =
  | 'recruiter_feedback'
  | 'student_feedback'
  | 'trainer_feedback'
  | 'assessment_result'
  | 'simulation_result'
  | 'resume_alignment'
  | 'project_evidence'
  | 'other';

export type PatternStrength = 'limited_evidence' | 'emerging_pattern' | 'repeated_pattern';

export type RecoveryStatus = 'recommended' | 'started' | 'completed';
export type RecoveryActionType = 'primary' | 'supporting';
export type RecoveryActionStatus = 'pending' | 'in_progress' | 'completed';
export type ReassessmentResult = 'improved' | 'no_change' | 'declined' | 'unclear';

export interface Student {
  id: string;
  name: string;
  email: string | null;
  targetRole: string | null;
  createdAt: string;
}

export interface Opportunity {
  id: string;
  studentId: string;
  companyName: string;
  roleTitle: string;
  roleCategory: string;
  source: string | null;
  targetAlignment: TargetAlignment;
  customStageLabel: string | null;
  createdAt: string;
}

export interface ApplicationStage {
  id: string;
  opportunityId: string;
  stageKey: StageKey;
  label: string;
  sortOrder: number;
  status: StageStatus;
  isFurthest: boolean;
  completedAt: string | null;
}

export interface OutcomeEvidence {
  id: string;
  opportunityId: string;
  applicationStageId: string | null;
  evidenceType: EvidenceType;
  source: EvidenceSource;
  failureCategory: FailureCategory | null;
  contentText: string | null;
  createdAt: string;
}

export interface RecoveryAction {
  id: string;
  recoveryPlanId: string;
  actionType: RecoveryActionType;
  title: string;
  description: string;
  status: RecoveryActionStatus;
  completedAt: string | null;
}

export interface RecoveryPlan {
  id: string;
  studentId: string;
  opportunityId: string | null;
  failureCategory: FailureCategory;
  patternStrength: PatternStrength;
  rationaleFallback: string;
  rationaleAI: string | null;
  status: RecoveryStatus;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface Reassessment {
  id: string;
  recoveryPlanId: string;
  result: ReassessmentResult;
  notes: string | null;
  createdAt: string;
}

export interface TrajectoryNote {
  id: string;
  studentId: string;
  summary: string;
  sourceType: 'outcome' | 'recovery_completed' | 'reassessment';
  sourceId: string | null;
  createdAt: string;
}

export interface ProductEvent {
  id: string;
  studentId: string | null;
  eventType: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

// ---- Derived / computed shapes (never persisted directly) ----

export interface FunnelStagePoint {
  stageKey: StageKey;
  label: string;
  count: number;
  conversionFromPrevious: number | null; // null for the first stage
  sampleQuality: PatternStrength | 'none';
}

export interface FunnelResult {
  totalOpportunities: number;
  stages: FunnelStagePoint[];
  bottleneck: {
    fromStage: StageKey;
    toStage: StageKey;
    dropCount: number;
    conversionRate: number;
    confidence: PatternStrength;
  } | null;
}

export interface OutcomeAnalysis {
  opportunityId: string;
  knowns: string[];
  unknowns: string[];
  evidenceType: 'DIRECT_EVIDENCE' | 'REPEATED_SIGNAL' | 'POSSIBLE_CONTRIBUTOR' | 'UNKNOWN';
  patternStrength: PatternStrength | 'none';
  patternStageKey: StageKey | null;
  patternCount: number;
  failureCategory: FailureCategory | null;
  controllability: Controllability | null;
  hasDirectEvidence: boolean;
  directEvidenceTexts: string[];
}

export interface AINarrative {
  outcomeSummary: string | null;
  patternExplanation: string | null;
  recoveryRationale: string | null;
}
