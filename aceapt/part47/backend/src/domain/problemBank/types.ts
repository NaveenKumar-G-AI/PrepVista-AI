/**
 * Core domain vocabulary for the Guided Solving Engine.
 *
 * INTEGRATION NOTE: in a real ACEAPT deployment, "the problem" (its prompt,
 * canonical solution, and skill tag) already lives in the existing
 * Question/Solution/Skill services (spec Sections 6-7, 61, 70). This file
 * models the *shape* Feature 47 needs from that data - a ProblemTemplate -
 * so the engine can be built against a stable contract without inventing a
 * duplicate Question model. `problemBank/index.ts` is the seam: swap its
 * in-memory registry for a call into the real Question service and nothing
 * else in this codebase needs to change.
 */

export type ProblemType =
  | 'ARITHMETIC'
  | 'ALGEBRA'
  | 'GEOMETRY'
  | 'PERMUTATION_COMBINATION'
  | 'PROBABILITY'
  | 'DATA_INTERPRETATION'
  | 'LOGICAL_REASONING'
  | 'ANALYTICAL_REASONING'
  | 'PATTERN_REASONING'
  | 'PUZZLE_REASONING'
  | 'READING_COMPREHENSION'
  | 'GRAMMAR'
  | 'VOCABULARY';

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

export type ExpectedInputType =
  | 'TEXT'
  | 'NUMERIC'
  | 'CHOICE'
  | 'UNIT_VALUE'
  | 'STRUCTURED_FIELDS';

export type ValidationType =
  | 'NUMERIC_TOLERANCE'
  | 'UNIT_VALUE'
  | 'MULTIPLE_CHOICE'
  | 'ALGEBRAIC_EQUIVALENCE'
  | 'STRUCTURED_FIELD_SET'
  | 'ANSWER_KEY';

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

/** The seven-state result vocabulary required by Section 17. Never collapse to a bare pass/fail. */
export type StepResult =
  | 'CORRECT'
  | 'PARTIALLY_CORRECT'
  | 'INCORRECT'
  | 'FORMAT_ERROR'
  | 'UNIT_ERROR'
  | 'INCOMPLETE'
  | 'UNKNOWN';

/** Section 35: the kind of help a struggling student actually needs. */
export type AssistanceIssueType =
  | 'CONCEPT'
  | 'STRATEGY'
  | 'FORMULA'
  | 'CALCULATION'
  | 'INTERPRETATION'
  | 'UNIT'
  | 'LOGIC'
  | 'VERIFICATION';

export interface ChoiceOption {
  id: string;
  label: string;
}

/** Validator input specs - discriminated by ValidationType. Kept as small plain objects so
 * they are JSON-serializable if a problem template is ever authored outside of TypeScript
 * (e.g. by a CMS backed by the existing Question service). */
export interface NumericToleranceSpec {
  expected: number;
  tolerance?: number;
}
export interface UnitValueSpec {
  expectedValue: number;
  expectedUnit: string;
  tolerance?: number;
  unitAliases?: Record<string, string>;
}
export interface MultipleChoiceSpec {
  correctOptionId: string;
  options: ChoiceOption[];
}
export interface AlgebraicEquivalenceSpec {
  expectedExpression: string; // e.g. "x = 5" or "20 - 3*x"
  variables?: string[];
  sampleRange?: [number, number];
  trials?: number;
}
export interface StructuredFieldSpec {
  fields: { key: string; expected: number | string; label: string }[];
}
export interface AnswerKeySpec {
  acceptable: string[];
  caseSensitive?: boolean;
}

export type ValidationSpec =
  | { type: 'NUMERIC_TOLERANCE'; spec: NumericToleranceSpec }
  | { type: 'UNIT_VALUE'; spec: UnitValueSpec }
  | { type: 'MULTIPLE_CHOICE'; spec: MultipleChoiceSpec }
  | { type: 'ALGEBRAIC_EQUIVALENCE'; spec: AlgebraicEquivalenceSpec }
  | { type: 'STRUCTURED_FIELD_SET'; spec: StructuredFieldSpec }
  | { type: 'ANSWER_KEY'; spec: AnswerKeySpec };

/**
 * A single step in a solving path (Section 11-12).
 *
 * `deriveExpectedGivenPriorAttempts` is what makes cascading-error detection
 * (Section 18-19) possible: given the *student's own* numeric values from
 * earlier steps (right or wrong), it computes what this step's answer would
 * be if we charitably carried their earlier work forward. Keys are the
 * producing step's stepId for a plain numeric/unit step, or
 * `${stepId}.${fieldKey}` for a value that came out of a
 * STRUCTURED_FIELD_SET step. See domain/engine/errorLocalization.ts.
 */
export interface StepTemplate {
  stepId: string;
  sequence: number;
  type: StepType;
  objective: string;
  prompt: string;
  skill: string;
  subskill?: string;
  expectedInputType: ExpectedInputType;
  validation: ValidationSpec;
  difficulty: Difficulty;
  prerequisites?: string[];
  /** Escalating hint ladder, index 0 = smallest possible nudge (Section 22-24). */
  hintLadder: string[];
  explanation: string;
  /** Optional finer-grained breakdown for a struggling student (Section 32). */
  microSteps?: StepTemplate[];
  deriveExpectedGivenPriorAttempts?: (priorNumericValuesByStepId: Record<string, number>) => number | null;
}

export interface AlternateMethod {
  methodId: string;
  label: string;
  steps: StepTemplate[];
}

export interface ReconstructionPrompt {
  promptId: string;
  prompt: string;
  acceptable: string[];
}

export interface TransferVariant {
  variantId: string;
  title: string;
  promptText: string;
  steps: StepTemplate[];
}

export interface ProblemTemplate {
  problemId: string;
  type: ProblemType;
  title: string;
  promptText: string;
  skill: string;
  difficulty: Difficulty;
  steps: StepTemplate[];
  alternateMethods?: AlternateMethod[];
  reconstructionPrompts: ReconstructionPrompt[];
  /** Used by Independent Verification / Transfer (Sections 30-31, 77). */
  transferVariants: TransferVariant[];
}
