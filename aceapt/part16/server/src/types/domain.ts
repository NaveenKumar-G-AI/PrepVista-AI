import { RootCause } from './rootCause';
import { InterventionType, EscalationLevel } from './intervention';

export type InterventionStatus = 'recommended' | 'in_progress' | 'completed_improved' | 'completed_not_improved';

export interface InterventionRecord {
  id: string;
  studentId: string;
  skillId: string;
  microSkillId?: string;
  rootCause: RootCause;
  interventionType: InterventionType;
  escalationLevel: EscalationLevel;
  status: InterventionStatus;
  beforeAccuracy?: number;
  afterAccuracy?: number;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  sourceAttemptId: string;
}

export interface HintAttemptRecord {
  id: string;
  interventionId: string;
  studentId: string;
  level: number;
  createdAt: string;
}

export type RecoveryStepType = 'clarification' | 'contrast' | 'guided' | 'independent' | 'transfer';
export type RecoveryStepStatus = 'pending' | 'completed';

export interface RecoveryStep {
  index: number;
  type: RecoveryStepType;
  title: string;
  estimatedMinutes: number;
  status: RecoveryStepStatus;
}

export type RecoverySessionStatus = 'in_progress' | 'completed' | 'abandoned';

export interface RecoverySession {
  id: string;
  studentId: string;
  skillId: string;
  microSkillId?: string;
  triggeringPattern: string;
  rootCause: RootCause;
  steps: RecoveryStep[];
  status: RecoverySessionStatus;
  createdAt: string;
  completedAt?: string;
}

export interface EffectivenessResult {
  improved: boolean;
  beforeAccuracy: number;
  afterAccuracy: number;
  delta: number;
  independenceTrend: 'improved' | 'unchanged' | 'declined' | 'unknown';
  transferStatus: 'not_assessed' | 'weak' | 'developing' | 'strong';
  note: string;
}

export interface StudentInterventionTypeStat {
  interventionType: InterventionType;
  helpfulCount: number;
  unhelpfulCount: number;
  lastOutcomeAt?: string;
}

export interface StudentInterventionProfile {
  studentId: string;
  stats: StudentInterventionTypeStat[];
}

export interface InterventionHistoryRow {
  skillLabel: string;
  rootCauseLabel: string;
  interventionLabel: string;
  result: string;
  next: string;
  createdAt: string;
}
