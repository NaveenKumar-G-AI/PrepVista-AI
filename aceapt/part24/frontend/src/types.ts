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
export type RecoverySessionStatus = 'IN_PROGRESS' | 'AWAITING_DELAYED_VERIFICATION' | 'VERIFIED_STABLE' | 'VERIFICATION_FAILED';

export interface RetentionAssessment {
  studentId: string;
  skillId: string;
  skillName: string;
  masteryScore: number | null;
  retentionScore: number | null;
  memoryState: MemoryStateName;
  confidence: ConfidenceLevel;
  retentionRisk: number | null;
  trend: Trend;
  recurringWeakness: boolean;
  escalationLevel: number;
  lastEvidenceAt: string | null;
  evidenceCount: number;
  delayedEvidenceCount: number;
  currentRecoveryStatus: RecoverySessionStatus | null;
  explanationKey: string;
}

export interface MemoryProfile {
  studentId: string;
  assessments: RetentionAssessment[];
  memoryHealth: { strong: number; needsAttention: number; recurring: number; atRiskCritical: number };
}

export type PriorityReason = 'AT_RISK' | 'RECURRING_WEAKNESS' | 'VERIFICATION_REQUIRED' | 'DECAYING' | 'FORGOTTEN';

export interface MemoryPriorityItem {
  skillId: string;
  skillName: string;
  reason: PriorityReason;
  priorityScore: number;
  estimatedMinutes: number;
  retentionRisk: number;
  memoryState: MemoryStateName;
}

export interface MemoryPrioritiesResult {
  priorities: MemoryPriorityItem[];
  stable: { skillId: string; skillName: string }[];
  totalNeedingAttention: number;
  estimatedTotalMinutes: number;
}

export interface RecoveryQuestionPublic {
  id: string;
  skillId: string;
  stepRole: 'recall' | 'apply' | 'vary' | 'verify';
  stepTitle: string;
  prompt: string;
  options: { id: string; text: string }[];
}

export interface RecoverySession {
  id: string;
  studentId: string;
  skillId: string;
  createdAt: string;
  failureType: string;
  interventionType: string;
  escalationLevel: number;
  status: RecoverySessionStatus;
  beforeScore: number | null;
  immediateScore: number | null;
  delayedScore: number | null;
  delayedVerificationAt: string | null;
}

export interface RecoveryRecommendation {
  mode: 'RECOVERY' | 'DELAYED_VERIFICATION';
  session: RecoverySession;
  questions: RecoveryQuestionPublic[];
  explanation: string;
  failureType: string;
  interventionType: string;
  contentAuthored?: boolean;
}

export interface GradedAnswer {
  questionId: string;
  correct: boolean;
  correctOptionId: string;
}

export interface RecoveryResultResponse {
  score: number;
  correctCount: number;
  total: number;
  results: GradedAnswer[];
  beforeScore: number | null;
  assessment: RetentionAssessment;
}

export interface DelayedVerificationResponse {
  score: number;
  correctCount: number;
  total: number;
  results: GradedAnswer[];
  verified: boolean;
  assessment: RetentionAssessment;
}

export interface SkillMeta {
  id: string;
  name: string;
  category: string;
}
