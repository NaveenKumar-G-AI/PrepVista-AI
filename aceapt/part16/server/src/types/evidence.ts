/**
 * Evidence types. These fields mirror the evidence list Feature 16 is allowed to
 * consume (answer correctness, response time, difficulty, question type, skill,
 * prerequisite skill, prior attempts, error pattern, hint usage, solution path,
 * mastery/transfer/retention/readiness state, intervention history, recent and
 * historical performance). The diagnostic engine must never infer from a field
 * that isn't here — if a signal isn't modeled, it isn't evidence.
 */

export type Difficulty = 'easy' | 'medium' | 'hard';

export type QuestionType = 'standard' | 'unfamiliar_context' | 'exam_simulation' | 'reverse' | 'mixed';

export type StepType = 'concept' | 'strategy' | 'procedure' | 'calculation' | 'interpretation';

export interface SolutionStep {
  stepNumber: number;
  description: string;
  stepType: StepType;
  correct: boolean;
  studentInput?: string;
  expected?: string;
}

export type MasteryState = 'not_started' | 'developing' | 'proficient' | 'mastered' | 'regressed';
export type TransferState = 'not_assessed' | 'weak' | 'developing' | 'strong';
export type RetentionState = 'stable' | 'at_risk' | 'regressed';
export type ReadinessState = 'unassessed' | 'weak' | 'developing' | 'ready';

export interface SkillAccuracySample {
  skillId: string;
  accuracy: number; // 0-1
  sampleSize: number;
}

/** Behavioral signals as supplied by Feature 11. Never rendered as a judgment of the student. */
export interface BehavioralSignals {
  abandonmentRate?: number; // 0-1, fraction of recent sessions abandoned early
  hintOveruseFlag?: boolean;
  sessionConsistency?: 'consistent' | 'inconsistent';
}

/** A single prior intervention record, used for failed-intervention memory and escalation. */
export interface InterventionHistoryEntry {
  interventionId: string;
  skillId: string;
  rootCause: string;
  interventionType: string;
  escalationLevel: number;
  outcome: 'improved' | 'not_improved' | 'in_progress';
  createdAt: string;
}

/**
 * The evidence packet for a single student attempt. Everything here should be
 * either directly observed on the attempt or looked up from the student's
 * existing history in the store — never fabricated.
 */
export interface AttemptEvidence {
  studentId: string;
  skillId: string;
  microSkillId?: string;
  questionId: string;
  correct: boolean;
  responseTimeSeconds: number;
  expectedTimeSeconds: number;
  difficulty: Difficulty;
  questionType: QuestionType;
  hintsUsed: number;
  solutionPath?: SolutionStep[];
  prerequisiteSkillIds: string[];
  selfReportedReasonCode?: StuckReasonCode;
}

export type StuckReasonCode =
  | 'no_concept'
  | 'no_method'
  | 'know_method_cant_solve'
  | 'calculation_mistake'
  | 'dont_understand_question'
  | 'running_out_of_time';

export const STUCK_REASON_LABELS: Record<StuckReasonCode, string> = {
  no_concept: "I don't understand the concept.",
  no_method: "I don't know which method to use.",
  know_method_cant_solve: "I know the method but can't solve it.",
  calculation_mistake: 'I made a calculation mistake.',
  dont_understand_question: "I don't understand the question.",
  running_out_of_time: "I'm running out of time.",
};

/** Aggregated history the diagnostic engine pulls from the store to accompany one attempt. */
export interface StudentSkillHistory {
  studentId: string;
  skillId: string;
  recentAccuracy: SkillAccuracySample[]; // this skill + prerequisites, recent window
  historicalAccuracy: SkillAccuracySample[]; // longer-term window
  masteryState: MasteryState;
  transferState: TransferState;
  retentionState: RetentionState;
  readinessState: ReadinessState;
  interventionHistory: InterventionHistoryEntry[];
  behavioralSignals?: BehavioralSignals;
}
