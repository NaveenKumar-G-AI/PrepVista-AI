// Core domain types for the Socratic Teaching Mode engine.
// These are the shapes that flow between the state machine, the classifier,
// the teaching policy, the repository, and the API layer.

export type TeachingState =
  | "INTRODUCTION"
  | "OBJECTIVE_SETUP"
  | "IDENTIFICATION"
  | "GUIDED_REASONING"
  | "MISCONCEPTION_CHECK"
  | "HINT"
  | "PARTIAL_EXPLANATION"
  | "CHECKPOINT"
  | "TEACH_BACK"
  | "INDEPENDENT_ATTEMPT"
  | "TRANSFER_VERIFICATION"
  | "COMPLETED"
  | "ESCALATED";

export type ResponseClassification =
  | "CORRECT_REASONING"
  | "CORRECT_GUESS"
  | "PARTIALLY_CORRECT"
  | "MISCONCEPTION"
  | "INCORRECT"
  | "UNSURE"
  | "NO_RESPONSE"
  | "IRRELEVANT"
  | "AMBIGUOUS";

// 0 = question only ... 6 = worked explanation (see section 14 of the spec)
export type HelpLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type TeachingAction =
  | "ASK"
  | "HINT"
  | "REPHRASE"
  | "SIMPLIFY"
  | "EXPLAIN"
  | "VERIFY"
  | "REFLECT"
  | "COMPLETE"
  | "ESCALATE";

export type StudentControlIntent =
  | "request_hint"
  | "explain_directly"
  | "simplify"
  | "new_question"
  | "solve_independently"
  | null;

export interface LearningObjectiveContract {
  objective: string;
  targetSkill: string;
  targetSubskill?: string;
  successCriteria: string[];
}

export interface StudentThinkingState {
  objective: string;
  targetSkill: string;
  currentStep: string;
  understandingState: "not_understood" | "partial" | "guided" | "demonstrated" | "independent";
  responseState: ResponseClassification | null;
  misconception: string | null;
  hintLevel: HelpLevel;
  consecutiveHints: number;
  consecutiveIncorrect: number;
  independence: "not_yet" | "developing" | "demonstrated";
  confidenceSelfReport: "low" | "moderate" | "high" | null;
  turnsInCurrentState: number;
  totalTurns: number;
  achievedCriteria: string[];
  usedHintThisProblem: boolean;
}

export interface ProblemContext {
  skill: string;
  prompt: string;
  trustedAnswer: number;
  trustedSolutionSteps: string[];
  variables: Record<string, number | string>;
  generator: string;
}

export interface SocraticTurn {
  id: string;
  sessionId: string;
  sequence: number;
  speaker: "tutor" | "student";
  content: string;
  intent?: string;
  targetSkill?: string;
  targetStep?: string;
  helpLevel?: HelpLevel;
  responseClassification?: ResponseClassification;
  whyThisQuestion?: string;
  createdAt: string;
}

export interface MisconceptionExperimentState {
  misconceptionId: string;
  step: number;
  base: number;
  percent: number;
}

export interface CompletionSummary {
  skill: string;
  demonstrated: string[];
  stillDeveloping: string[];
  verification: "independent_problem_solved" | "not_verified" | "verification_failed";
  hintDependency: "none" | "low" | "moderate" | "high";
}

export interface SocraticSession {
  id: string;
  studentId: string;
  objective: LearningObjectiveContract;
  state: TeachingState;
  thinkingState: StudentThinkingState;
  problemContext: ProblemContext;
  misconceptionState?: MisconceptionExperimentState;
  status: "active" | "completed" | "escalated" | "abandoned";
  version: number;
  createdAt: string;
  updatedAt: string;
  completionSummary?: CompletionSummary;
}

export interface SocraticLearningSignal {
  id: string;
  studentId: string;
  sessionId: string;
  skill: string;
  signal: string;
  detail?: Record<string, unknown>;
  createdAt: string;
}
