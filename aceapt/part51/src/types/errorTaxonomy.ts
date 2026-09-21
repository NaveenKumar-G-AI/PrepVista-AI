/**
 * Error taxonomy — spec §9.
 *
 * "The exact names must follow the existing system" (§9). Since no existing
 * classifier was available to inspect (§146 pre-coding report), Feature 51
 * defines this taxonomy as its OWN default and consumes it through
 * MistakeClassificationPort (see src/ports) so the real ACEAPT classifier —
 * whatever names it actually uses — can be swapped in without touching any
 * downstream logic. Every function below keys off ErrorType as a plain
 * string union, not a hard-coded enum object, specifically so remapping the
 * literal values later is a type change, not a rewrite.
 */
export const ERROR_TYPES = [
  "CONCEPTUAL_ERROR",
  "STRATEGY_ERROR",
  "FORMULA_ERROR",
  "INPUT_MAPPING_ERROR",
  "CALCULATION_ERROR",
  "UNIT_ERROR",
  "INTERPRETATION_ERROR",
  "LOGIC_ERROR",
  "CONSTRAINT_ERROR",
  "TRANSFER_ERROR",
  "VERIFICATION_ERROR",
  "GUESSING_ERROR",
  "CARELESS_EXECUTION_SIGNAL",
  "UNKNOWN"
] as const;

export type ErrorType = (typeof ERROR_TYPES)[number];

export function isErrorType(value: string): value is ErrorType {
  return (ERROR_TYPES as readonly string[]).includes(value);
}

/** Intervention types — the drill/response side of the §41 mapping table. */
export const INTERVENTION_TYPES = [
  "CONCEPT_REINFORCEMENT",
  "STRATEGY_SELECTION_DRILL",
  "FORMULA_RECOGNITION_DRILL",
  "CALCULATION_PRECISION_DRILL",
  "VALUE_MAPPING_DRILL",
  "QUESTION_UNDERSTANDING_DRILL",
  "REASONING_DRILL",
  "CONDITION_TRACKING_DRILL",
  "ERROR_CHECK_DRILL",
  "BRIDGE_NOVEL_PRACTICE",
  "UNIT_AWARENESS_FEEDBACK",
  "NEEDS_INVESTIGATION" // UNKNOWN errors route here rather than guessing a drill
] as const;

export type InterventionType = (typeof INTERVENTION_TYPES)[number];

/** §11 — isolated vs. systematic error status. */
export const RECURRENCE_STATUSES = [
  "isolated",
  "recurring",
  "clustered",
  "resolved",
  "regressed"
] as const;

export type RecurrenceStatus = (typeof RECURRENCE_STATUSES)[number];
