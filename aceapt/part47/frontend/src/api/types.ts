export type StepType =
  | 'UNDERSTAND'
  | 'IDENTIFY'
  | 'CLASSIFY'
  | 'SELECT'
  | 'DECOMPOSE'
  | 'FORMULATE'
  | 'CALCULATE'
  | 'COMPARE'
  | 'ELIMINATE'
  | 'REASON'
  | 'VERIFY'
  | 'REFLECT';

export type ExpectedInputType = 'TEXT' | 'NUMERIC' | 'CHOICE' | 'UNIT_VALUE' | 'STRUCTURED_FIELDS';

export type StepResult = 'CORRECT' | 'PARTIALLY_CORRECT' | 'INCORRECT' | 'FORMAT_ERROR' | 'UNIT_ERROR' | 'INCOMPLETE' | 'UNKNOWN';

export type StepClassification = 'CORRECT' | 'FIRST_ERROR' | 'AFFECTED_BY_PRIOR_ERROR' | 'INDEPENDENT_ERROR' | 'SKIPPED' | 'PENDING';

export type AssistanceIssueType = 'CONCEPT' | 'STRATEGY' | 'FORMULA' | 'CALCULATION' | 'INTERPRETATION' | 'UNIT' | 'LOGIC' | 'VERIFICATION';

export type SessionMode = 'GUIDED' | 'VERIFICATION';
export type SessionStatus = 'STARTED' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ABANDONED' | 'TIMED_OUT';

export interface ChoiceOption {
  id: string;
  label: string;
}

export interface ProblemSummary {
  problemId: string;
  type: string;
  title: string;
  promptText: string;
  difficulty: string;
  skill: string;
}

export interface SolvingPathStepView {
  stepId: string;
  sequence: number;
  type: StepType;
  objective: string;
  status: 'COMPLETED' | 'CURRENT' | 'UPCOMING' | 'SKIPPED';
  classification: StepClassification | null;
}

export interface SessionView {
  sessionId: string;
  studentId: string;
  problemId: string;
  variantId: string | null;
  problemTitle: string;
  problemPromptText: string;
  problemType: string;
  mode: SessionMode;
  status: SessionStatus;
  version: number;
  currentStepIndex: number;
  totalSteps: number;
  solvingPath: SolvingPathStepView[];
  solutionRevealed: boolean;
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
  choiceOptions: ChoiceOption[] | null;
  structuredFields: { key: string; label: string }[] | null;
  helpLevel: number;
  status: string;
}

export interface SubmitStepResult {
  result: StepResult;
  detail: string | null;
  session: SessionView;
  allStepsComplete: boolean;
  deduped: boolean;
}

export interface GuidanceView {
  message: string;
  helpLevel: number;
  issueType?: AssistanceIssueType;
  source: 'AI' | 'DETERMINISTIC_FALLBACK' | 'TEMPLATE';
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

export interface GuidedOutcome {
  stepsTotal: number;
  stepsIndependent: number;
  stepsAssisted: number;
  hintsUsed: number;
  retries: number;
  firstErrorStepId: string | null;
  recoverySuccess: boolean;
  solutionRequested: boolean;
  reconstructionSuccess: boolean | null;
  verificationSessionId: string | null;
  verificationSuccess: boolean | null;
  transferSuccess: boolean | null;
  guidanceDependency: 'LOW' | 'MODERATE' | 'HIGH';
  studentFeedback: string | null;
}

export interface SummaryView {
  outcome: GuidedOutcome;
  guidanceDependencyMessage: string;
  suggestedNextHelpLevel: number;
}

export type StudentFeedback = 'VERY_HELPFUL' | 'HELPFUL' | 'TOO_MUCH_GUIDANCE' | 'NOT_ENOUGH_GUIDANCE' | 'WANTED_DIRECT_EXPLANATION';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}
