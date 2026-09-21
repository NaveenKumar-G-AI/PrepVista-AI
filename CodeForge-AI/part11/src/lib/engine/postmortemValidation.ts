import { POSTMORTEM_REQUIRED_FIELDS, PostmortemRow } from "./types";

export interface PostmortemValidationResult {
  valid: boolean;
  missingFields: string[];
  errors: string[];
}

const MIN_FIELD_LENGTH = 15;

/**
 * Deterministic completeness/quality gate applied before a postmortem can
 * move state RESOLVED -> POSTMORTEM -> EVALUATED. This intentionally checks
 * structure (presence + minimum substance), not prose quality — semantic
 * "is this a *good* postmortem" judgment is the AI coaching layer's job,
 * not this gate's. See "CRITICAL TEST CASES: Student submits invalid
 * postmortem -> validation failure" in the brief.
 */
export function validatePostmortem(pm: Partial<PostmortemRow>): PostmortemValidationResult {
  const missingFields: string[] = [];
  const errors: string[] = [];

  for (const field of POSTMORTEM_REQUIRED_FIELDS) {
    const value = pm[field];
    if (typeof value !== "string" || value.trim().length < MIN_FIELD_LENGTH) {
      missingFields.push(field);
    }
  }

  if (!pm.preventiveActionKeys || pm.preventiveActionKeys.length === 0) {
    errors.push("At least one preventive action must be selected.");
  }

  if (!pm.fiveWhys || pm.fiveWhys.filter((w) => w.trim().length > 0).length < 3) {
    errors.push("Complete at least 3 of the 5 whys before submitting.");
  }

  if (missingFields.length > 0) {
    errors.push(`These sections need at least ${MIN_FIELD_LENGTH} characters: ${missingFields.join(", ")}.`);
  }

  return { valid: missingFields.length === 0 && errors.length === 0, missingFields, errors };
}
