export type MasteryState =
  | 'UNSEEN'
  | 'INTRODUCED'
  | 'FAMILIAR'
  | 'GUIDED'
  | 'PRACTICING'
  | 'INDEPENDENT'
  | 'STABLE'
  | 'RETAINED'
  | 'TRANSFERRED'
  | 'ROBUST_MASTERY';

export type GapFlag =
  | 'INSUFFICIENT_EVIDENCE'
  | 'INDEPENDENCE_GAP'
  | 'DIFFICULTY_GAP'
  | 'FORMAT_TRANSFER_GAP'
  | 'CONTEXT_TRANSFER_GAP'
  | 'TRANSFER_GAP'
  | 'RETENTION_GAP'
  | 'STABILITY_GAP'
  | 'ROOT_CAUSE_GAP'
  | 'COMPOSITION_GAP';

export interface Skill {
  id: string;
  domain: string;
  topic: string;
  name: string;
  prerequisiteIds: string[];
  compositeOf?: string[];
}

export interface Bucket {
  attempts: number;
  correct: number;
  accuracy: number | null;
}

export interface SkillEvidence {
  skillId: string;
  totalAttempts: number;
  independentAttempts: number;
  independentDistinctQuestions: number;
  guidedAccuracy: number | null;
  independentAccuracy: number | null;
  lifetimeIndependentAccuracy: number | null;
  byDifficulty: Record<'easy' | 'medium' | 'hard', Bucket>;
  byFormat: Record<string, Bucket>;
  byNovelty: Record<'seen' | 'similar' | 'varied' | 'novel', Bucket>;
  byContext: Record<string, Bucket>;
  familiarAccuracy: number | null;
  novelAccuracy: number | null;
  novelIndependentAttempts: number;
  retention: { immediateAccuracy: number | null; delayedAccuracy: number | null; delayedAttempts: number };
  hintUsageRate: number;
  avgRetries: number;
  rollingAccuracies: number[];
  lastAttemptAt: string | null;
}

export interface SkillAnalysis {
  skillId: string;
  evidence: SkillEvidence;
  sufficiency: 'SUFFICIENT' | 'INSUFFICIENT';
  difficultyCeiling: 'easy' | 'medium' | 'hard' | null;
  stability: 'STABLE' | 'UNSTABLE' | 'INSUFFICIENT';
  flags: GapFlag[];
  state: MasteryState;
  displayLabel: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  confidenceReason: string;
  rootCauseSkillIds: string[];
  nextAction: string;
}

export interface Student {
  id: string;
  name: string;
}

export interface MasteryCheckBlueprint {
  targetSkillId: string;
  questionCount: number;
  difficulties: string[];
  formats: string[];
  novelApplicationCount: number;
  purpose: string;
}

export interface CheckQuestion {
  id: string;
  prompt: string;
  difficulty: 'easy' | 'medium' | 'hard';
  format: string;
  novelty: string;
  context: string;
  choices?: string[];
}

export interface MasteryTransition {
  id: string;
  fromState: MasteryState;
  toState: MasteryState;
  reason: string;
  triggeredBy: string;
  timestamp: string;
}

export interface InterventionPlan {
  interventionType: string;
  description: string;
  targetGaps: GapFlag[];
  generatedBy: string;
}
