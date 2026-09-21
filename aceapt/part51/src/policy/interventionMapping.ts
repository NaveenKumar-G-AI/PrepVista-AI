import type { ErrorType, InterventionType } from "../types/errorTaxonomy.js";

/**
 * §41's mapping table, verbatim where the spec gives one. UNIT_ERROR,
 * GUESSING_ERROR, CARELESS_EXECUTION_SIGNAL and UNKNOWN aren't in §41's
 * table directly but each has an expected behavior spelled out elsewhere in
 * the spec:
 *  - UNIT_ERROR        → "unit-awareness feedback" (§117 test)
 *  - GUESSING_ERROR     → treated as a foundational-confidence gap, same
 *                          lane as a conceptual error (no separate mode
 *                          described anywhere in the spec)
 *  - CARELESS_EXECUTION_SIGNAL → "Let's practice calculation verification"
 *                          (§10's own worked example) → the error-check drill
 *  - UNKNOWN            → routed to investigation rather than guessing a
 *                          drill for an error we couldn't classify (§15's
 *                          "never fabricate" principle applied to
 *                          intervention selection, not just accuracy numbers)
 */
export const ERROR_TO_INTERVENTION: Record<ErrorType, InterventionType> = {
  CONCEPTUAL_ERROR: "CONCEPT_REINFORCEMENT",
  STRATEGY_ERROR: "STRATEGY_SELECTION_DRILL",
  FORMULA_ERROR: "FORMULA_RECOGNITION_DRILL",
  CALCULATION_ERROR: "CALCULATION_PRECISION_DRILL",
  INPUT_MAPPING_ERROR: "VALUE_MAPPING_DRILL",
  INTERPRETATION_ERROR: "QUESTION_UNDERSTANDING_DRILL",
  LOGIC_ERROR: "REASONING_DRILL",
  CONSTRAINT_ERROR: "CONDITION_TRACKING_DRILL",
  VERIFICATION_ERROR: "ERROR_CHECK_DRILL",
  TRANSFER_ERROR: "BRIDGE_NOVEL_PRACTICE",
  UNIT_ERROR: "UNIT_AWARENESS_FEEDBACK",
  GUESSING_ERROR: "CONCEPT_REINFORCEMENT",
  CARELESS_EXECUTION_SIGNAL: "ERROR_CHECK_DRILL",
  UNKNOWN: "NEEDS_INVESTIGATION"
};

export function getInterventionType(errorType: ErrorType): InterventionType {
  return ERROR_TO_INTERVENTION[errorType];
}
