import type { ValidationResult, ValidatorInput, ValidatorCategory, ValidationState, Severity, ErrorCode } from "./types.js";

/**
 * The one interface every validator implements (spec §11, §161: "validators must
 * remain independently testable"). Nothing about registry, planning, retries, or
 * caching leaks into this — a validator is a pure-ish async function over its input.
 */
export interface Validator {
  readonly name: string; // e.g. "MATH_VALIDATOR" — stable, used as a registry/cache key
  readonly category: ValidatorCategory;
  readonly version: string; // semver-ish string; bump on behavior change (spec §59)
  /** Validators this one depends on. The planner will not run this validator until
   *  all of these have reached a terminal state, and will SKIP (not fail) this
   *  validator if a dependency did not PASS/PASS_WITH_WARNING (spec §16, §93). */
  readonly dependsOn: readonly string[];
  /** Whether this validator applies to the given question at all — e.g. OptionsValidator
   *  is NOT_APPLICABLE to a NUMERIC answer type. Checked before `validate` is even called
   *  so "not applicable" never gets confused with "ran and passed" (spec §12, §90). */
  isApplicable(input: ValidatorInput): boolean;
  validate(input: ValidatorInput): Promise<ValidationResult>;
}

/** Convenience base builder so every concrete validator produces a consistently
 *  shaped ValidationResult without repeating timestamp/duration bookkeeping. */
export function buildResult(params: {
  validator: string;
  category: ValidatorCategory;
  status: ValidationState;
  severity: Severity;
  code: ErrorCode;
  message: string;
  evidence?: Record<string, unknown>;
  validatorVersion: string;
  startedAt: number; // Date.now() captured by the caller before work began
  skippedReason?: string;
}): ValidationResult {
  const result: ValidationResult = {
    validator: params.validator,
    category: params.category,
    status: params.status,
    severity: params.severity,
    code: params.code,
    message: params.message,
    evidence: params.evidence ?? {},
    validatorVersion: params.validatorVersion,
    validatedAt: new Date().toISOString(),
    durationMs: Date.now() - params.startedAt
  };
  if (params.skippedReason) result.skippedReason = params.skippedReason;
  return result;
}
