/**
 * ACEAPT — Feature 48: Hint Intelligence Engine
 * ------------------------------------------------
 * Core domain types shared by the policy engine, generator, validator, persistence layer,
 * and API. Nothing in this file talks to a database, an LLM, or HTTP — it's the vocabulary
 * everything else is written in. Spec references point back to sections of the master prompt.
 */

// ---------------------------------------------------------------------------------------
// Taxonomy — spec §14 (hint types), §15 (levels), §13 (block/"stuck" types), §11 (triggers),
// §21 (outcomes), §38 (dependency), §32 (assessment modes), §44 (mistake signal)
// ---------------------------------------------------------------------------------------

export enum HintType {
  STARTING_POINT = "STARTING_POINT",
  CONCEPT = "CONCEPT",
  STRATEGY = "STRATEGY",
  FORMULA = "FORMULA",
  INPUT_MAPPING = "INPUT_MAPPING",
  DECOMPOSITION = "DECOMPOSITION",
  CALCULATION = "CALCULATION",
  INTERPRETATION = "INTERPRETATION",
  UNIT = "UNIT",
  VERIFICATION = "VERIFICATION",
  EXAMPLE = "EXAMPLE",
  COUNTEREXAMPLE = "COUNTEREXAMPLE",
  COMPARISON = "COMPARISON",
  VISUAL = "VISUAL",
  PARTIAL_STEP = "PARTIAL_STEP",
}

/** Progressive disclosure ladder. Higher = more revealing. §15, §16, §26. */
export enum HintLevel {
  L0_NONE = 0,
  L1_DIRECTIONAL = 1,
  L2_CONCEPTUAL = 2,
  L3_NEXT_ACTION = 3,
  L4_PARTIAL_WORKING = 4,
  L5_STEP_GUIDANCE = 5,
  L6_WORKED_STEP = 6,
  L7_COMPLETE_SOLUTION = 7,
}

/** What kind of "stuck" this is. §13. Diagnosis drives hint type selection — §10, §44. */
export enum BlockType {
  CONCEPT_BLOCK = "CONCEPT_BLOCK",
  STARTING_POINT_BLOCK = "STARTING_POINT_BLOCK",
  STRATEGY_BLOCK = "STRATEGY_BLOCK",
  FORMULA_BLOCK = "FORMULA_BLOCK",
  INPUT_MAPPING_BLOCK = "INPUT_MAPPING_BLOCK",
  CALCULATION_BLOCK = "CALCULATION_BLOCK",
  INTERPRETATION_BLOCK = "INTERPRETATION_BLOCK",
  VERIFICATION_BLOCK = "VERIFICATION_BLOCK",
  CONFIDENCE_BLOCK = "CONFIDENCE_BLOCK",
  UNKNOWN = "UNKNOWN",
}

/** Why a hint is being considered at all. §11. */
export enum TriggerType {
  EXPLICIT_REQUEST = "EXPLICIT_REQUEST",
  REPEATED_FAILURE = "REPEATED_FAILURE",
  STUCKNESS = "STUCKNESS",
  EXPLICIT_CONFUSION = "EXPLICIT_CONFUSION",
  LONG_STALL = "LONG_STALL",
  REPEATED_SAME_ERROR = "REPEATED_SAME_ERROR",
}

/** Did the hint actually work? §21. */
export enum HintOutcomeResultEnum {
  SUCCESS = "SUCCESS",
  PARTIAL = "PARTIAL",
  NO_EFFECT = "NO_EFFECT",
  CONFUSION = "CONFUSION",
  INAPPROPRIATE = "INAPPROPRIATE",
}

/** §38 — evidence-based, not a permanent label. UNKNOWN until there's enough history. */
export enum DependencyState {
  LOW = "LOW",
  MODERATE = "MODERATE",
  HIGH = "HIGH",
  UNKNOWN = "UNKNOWN",
}

/** §32–§36 — governs whether hints exist at all right now. */
export enum AssessmentMode {
  PRACTICE = "PRACTICE",
  GUIDED = "GUIDED",
  LIMITED_HELP = "LIMITED_HELP",
  ASSESSMENT = "ASSESSMENT",
}

/**
 * Output of (the real) Mistake Intelligence for a submitted attempt. §44: "use actual signals" —
 * the block diagnosis below is built to consume this rather than re-deriving it from scratch.
 */
export enum MistakeSignal {
  NONE = "NONE",
  NO_ATTEMPT = "NO_ATTEMPT",
  WRONG_STRATEGY = "WRONG_STRATEGY",
  WRONG_FORMULA = "WRONG_FORMULA",
  WRONG_REFERENCE_VALUE = "WRONG_REFERENCE_VALUE",
  CALCULATION_ERROR = "CALCULATION_ERROR",
  MISREAD_QUESTION = "MISREAD_QUESTION",
  UNIT_ERROR = "UNIT_ERROR",
  GUESS_CORRECT = "GUESS_CORRECT",
  CONCEPT_ERROR = "CONCEPT_ERROR",
}

/**
 * How THIS hint approaches the block, as opposed to how strong it is. §20 multi-strategy engine.
 * A "still stuck" escalation changes this before it turns the level up (§19) — the fix for a
 * failed hint is a different angle, not a louder version of the same one.
 */
export type StrategyTag =
  | "DIRECT_CLUE"
  | "EXAMPLE"
  | "CONTRAST"
  | "COMPARISON"
  | "COUNTEREXAMPLE"
  | "DECOMPOSITION"
  | "VERIFICATION"
  | "AFFIRMATION"
  | "WORKED_STEP";

export type RequestedOrAutomatic = "REQUESTED" | "AUTOMATIC";

// ---------------------------------------------------------------------------------------
// Trusted content — §28–§31. The only source hints (and validation) are allowed to be
// grounded in. Nothing downstream should ever ask an LLM to "remember" a question.
// ---------------------------------------------------------------------------------------

export interface TrustedSolutionStep {
  stepId: string;
  title: string;
  /** Ground-truth explanation of this step. Only sent to the student at/near WORKED_STEP level. */
  explanation: string;
  formula?: string;
  correctValue: string;
}

export interface TrustedQuestion {
  problemId: string;
  skillId: "PERCENTAGE" | "PROBABILITY" | "LOGICAL_PUZZLE";
  difficulty: "EASY" | "MEDIUM" | "HARD";
  prompt: string;
  finalAnswer: string;
  solutionSteps: TrustedSolutionStep[];
  /**
   * Stand-in for the real Mistake Intelligence classifier (§44), scoped to this question.
   * A production system calls the real service instead — see src/integration/stubs.ts.
   */
  classifyMistake?: (stepId: string, normalizedAttempt: string) => MistakeSignal;
}

// ---------------------------------------------------------------------------------------
// Student-facing signal inputs — §9, §12, §37, §48
// ---------------------------------------------------------------------------------------

export interface AttemptSnapshot {
  raw: string;
  isCorrect: boolean;
  mistakeSignal: MistakeSignal;
}

/** §35–36 — per-mode configuration, never a hard-coded universal number. */
export interface HintBudget {
  maxHints?: number;
  maxLevel?: HintLevel;
  timeLimitMs?: number;
  allowedTypes?: HintType[];
}

/** §24–25 — only ever learned from explicit settings or repeated outcomes, never inferred psychology. */
export interface HintPreference {
  studentId: string;
  prefersShortHints?: boolean;
  prefersExamples?: boolean;
  prefersStepGuidance?: boolean;
  prefersQuestions?: boolean;
}

// ---------------------------------------------------------------------------------------
// Interaction + outcome records — §22, §68
// ---------------------------------------------------------------------------------------

export interface HintInteraction {
  id: string;
  sessionId: string;
  studentId: string;
  problemId: string;
  stepId: string;
  attemptContextVersion: number;
  trigger: TriggerType;
  blockType: BlockType;
  hintType: HintType;
  hintLevel: HintLevel;
  strategyTag: StrategyTag;
  revealsAnswer: boolean;
  message: string;
  rationale: string;
  requestedOrAutomatic: RequestedOrAutomatic;
  shownAt: string;
}

export interface HintOutcome {
  interactionId: string;
  result: HintOutcomeResultEnum;
  timeToRecoveryMs?: number;
  subsequentIndependence?: boolean;
  recordedAt: string;
}

// ---------------------------------------------------------------------------------------
// Policy engine contract — §10, §61
// ---------------------------------------------------------------------------------------

export interface PolicyRequest {
  studentId: string;
  sessionId: string;
  problemId: string;
  stepId: string;
  skillId: TrustedQuestion["skillId"];
  difficulty: TrustedQuestion["difficulty"];
  trigger: TriggerType;
  /** Undefined = the student hasn't submitted anything on this step yet. */
  attempt?: AttemptSnapshot;
  attemptCountOnStep: number;
  sameErrorStreak: number;
  timeOnStepMs: number;
  /** Benchmark used to judge stalls relative to difficulty, never against an absolute clock. §37. */
  medianTimeForStepMs: number;
  explicitConfidenceSelfReport?: "CHECKING_UNIT_ONLY" | "UNSURE_DESPITE_CORRECT";
  priorHintsThisStep: HintInteraction[];
  priorOutcomesThisStep: HintOutcome[];
  dependencyState: DependencyState;
  assessmentMode: AssessmentMode;
  hintsExplicitlyPermittedInAssessment: boolean;
  budget?: HintBudget;
  preference?: HintPreference;
  requestFullSolution?: boolean;
}

export type DenialReason = "ASSESSMENT_DISABLED" | "BUDGET_EXCEEDED" | "INSUFFICIENT_EVIDENCE" | "ALREADY_RESOLVED";

export interface PolicyDecision {
  shouldOffer: boolean;
  denialReason?: DenialReason;
  blockType: BlockType;
  hintType: HintType;
  hintLevel: HintLevel;
  strategyTag: StrategyTag;
  targetStepId: string;
  revealsAnswer: boolean;
  rationale: string;
  maxWords: number;
  /** §47 — a correct-but-guessed answer gets a reasoning check, not a hint. */
  followUp?: "ASK_REASONING_FOR_GUESS";
}

export interface GeneratedHint {
  message: string;
  hintType: HintType;
  hintLevel: HintLevel;
  revealsAnswer: boolean;
  confidence: "high" | "medium" | "low";
  source: "LLM" | "DETERMINISTIC";
}
