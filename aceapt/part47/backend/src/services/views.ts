import type {
  AssistanceIssueType,
  ChoiceOption,
  ExpectedInputType,
  ProblemType,
  StepResult,
  StepType,
} from '../domain/problemBank/types.js';
import type { StepClassification } from '../domain/engine/errorLocalization.js';
import type { SessionStatus, StepStatus } from '../domain/engine/stateMachine.js';
import type { AssistanceSource, GuidedOutcomeRecord, SessionMode } from '../repositories/records.js';
import type { PastProblemRecord, SolveOutcome } from '../domain/engine/fading.js';

export interface SolvingPathStepView {
  stepId: string;
  sequence: number;
  type: StepType;
  objective: string;
  status: 'COMPLETED' | 'CURRENT' | 'UPCOMING' | 'SKIPPED';
  /** Null while the step is still pending/upcoming - see errorLocalization.ts for the four possible values otherwise. */
  classification: StepClassification | null;
}

export interface SessionView {
  sessionId: string;
  studentId: string;
  problemId: string;
  variantId: string | null;
  problemTitle: string;
  problemPromptText: string;
  problemType: ProblemType;
  mode: SessionMode;
  status: SessionStatus;
  version: number;
  currentStepIndex: number;
  totalSteps: number;
  solvingPath: SolvingPathStepView[];
  solutionRevealed: boolean;
  /** False for VERIFICATION-mode sessions - the UI should hide hint/explain/next/solution controls entirely. */
  allowsGuidance: boolean;
}

export interface CurrentStepView {
  stepId: string;
  sequence: number;
  totalSteps: number;
  type: StepType;
  objective: string;
  prompt: string;
  expectedInputType: ExpectedInputType;
  /** Present only for MULTIPLE_CHOICE steps. Labels only - never which one is correct. */
  choiceOptions: ChoiceOption[] | null;
  /** Present only for STRUCTURED_FIELD_SET steps. Keys/labels only - never expected values. */
  structuredFields: { key: string; label: string }[] | null;
  helpLevel: number;
  status: StepStatus;
}

export interface GuidanceView {
  message: string;
  helpLevel: number;
  issueType?: AssistanceIssueType;
  source: AssistanceSource;
}

export interface NextStepPreview {
  nextStepPreview: { objective: string; prompt: string; type: StepType } | null;
  isFinalStep: boolean;
}

export interface FullSolutionView {
  steps: { stepId: string; objective: string; explanation: string; answer: string }[];
  reconstructionPrompts: { promptId: string; prompt: string }[];
}

export interface ReconstructionResult {
  success: boolean;
  results: { promptId: string; correct: boolean }[];
}

export interface SubmitStepResult {
  result: StepResult;
  detail: string | null;
  session: SessionView;
  allStepsComplete: boolean;
  /** True if this call returned a cached result from an earlier identical clientRequestId (Sections 93, 107). */
  deduped: boolean;
}

export interface SummaryView {
  outcome: GuidedOutcomeRecord;
  guidanceDependencyMessage: string;
  suggestedNextHelpLevel: number;
}

export const ALLOWED_STUDENT_FEEDBACK = [
  'VERY_HELPFUL',
  'HELPFUL',
  'TOO_MUCH_GUIDANCE',
  'NOT_ENOUGH_GUIDANCE',
  'WANTED_DIRECT_EXPLANATION',
] as const;
export type StudentFeedback = (typeof ALLOWED_STUDENT_FEEDBACK)[number];

/** Section 78/79: turns a stored outcome record into the shape fading.ts's recommender expects. */
export function toPastProblemRecord(outcome: GuidedOutcomeRecord): PastProblemRecord {
  let solveOutcome: SolveOutcome;
  if (outcome.solutionRequested) solveOutcome = 'SOLUTION_REVEALED';
  else if (outcome.stepsTotal > 0 && outcome.stepsIndependent === outcome.stepsTotal) solveOutcome = 'INDEPENDENT';
  else if (outcome.recoverySuccess) solveOutcome = 'RECOVERED_WITH_GUIDANCE';
  else solveOutcome = 'FAILED';
  return { outcome: solveOutcome, hintsUsed: outcome.hintsUsed };
}
