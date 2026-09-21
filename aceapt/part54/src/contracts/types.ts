/**
 * ACEAPT Feature 54 — Question Validation Engine
 * Core contracts shared by every validator, the planner, the executor, and the aggregator.
 *
 * Design intent (per the Feature 54 build spec):
 *  - A validator NEVER returns a bare boolean or a single "score" — it returns a
 *    structured ValidationResult carrying status, severity, a stable machine-readable
 *    code, a human message, and evidence.
 *  - "Validator failed to run" (VALIDATION_ERROR territory: ERROR / SKIPPED / NOT_RUN)
 *    is always kept distinct from "validator ran and found the question invalid"
 *    (FAIL / PASS_WITH_WARNING). Nothing in this file conflates the two.
 */

// ---------------------------------------------------------------------------
// Validation result states (spec §12)
// ---------------------------------------------------------------------------
export const VALIDATION_STATES = [
  "NOT_RUN",
  "RUNNING",
  "PASS",
  "PASS_WITH_WARNING",
  "FAIL",
  "ERROR",
  "SKIPPED",
  "NOT_APPLICABLE",
  "STALE"
] as const;
export type ValidationState = (typeof VALIDATION_STATES)[number];

/** States that represent "the validator successfully rendered a verdict about the content." */
export const CONTENT_VERDICT_STATES: ReadonlySet<ValidationState> = new Set([
  "PASS",
  "PASS_WITH_WARNING",
  "FAIL"
]);

/** States that represent "we do not have a trustworthy current verdict" — never treat these as PASS. */
export const NON_VERDICT_STATES: ReadonlySet<ValidationState> = new Set([
  "NOT_RUN",
  "RUNNING",
  "ERROR",
  "SKIPPED",
  "NOT_APPLICABLE",
  "STALE"
]);

// ---------------------------------------------------------------------------
// Severity (spec §13)
// ---------------------------------------------------------------------------
export const SEVERITIES = ["NONE", "INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type Severity = (typeof SEVERITIES)[number];

const SEVERITY_RANK: Record<Severity, number> = {
  NONE: 0,
  INFO: 1,
  LOW: 2,
  MEDIUM: 3,
  HIGH: 4,
  CRITICAL: 5
};

export function maxSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

export function severityAtLeast(value: Severity, floor: Severity): boolean {
  return SEVERITY_RANK[value] >= SEVERITY_RANK[floor];
}

// ---------------------------------------------------------------------------
// Validation modes (spec §14)
// ---------------------------------------------------------------------------
export const VALIDATION_MODES = [
  "FAST",
  "STANDARD",
  "DEEP",
  "ASSESSMENT",
  "RUNTIME",
  "REVALIDATION"
] as const;
export type ValidationMode = (typeof VALIDATION_MODES)[number];

// ---------------------------------------------------------------------------
// Validator categories (spec §17)
// ---------------------------------------------------------------------------
export const VALIDATOR_CATEGORIES = [
  "SCHEMA",
  "ANSWER",
  "SOLUTION",
  "MATH",
  "LOGIC",
  "OPTIONS",
  "UNITS",
  "CONSTRAINTS",
  "SKILL",
  "DIFFICULTY",
  "RUNTIME",
  "ASSETS",
  "SCORING",
  "ASSESSMENT",
  "AI_SEMANTIC"
] as const;
export type ValidatorCategory = (typeof VALIDATOR_CATEGORIES)[number];

// ---------------------------------------------------------------------------
// Stable, machine-readable error codes (spec §95). Additive-only: never repurpose
// a code for a different meaning once shipped, since consumers (Feature 53, the
// admin filters in §131) match on these strings.
// ---------------------------------------------------------------------------
export const ERROR_CODES = [
  "VALID",
  "SCHEMA_MISSING_FIELD",
  "SCHEMA_INVALID_TYPE",
  "SCHEMA_INVALID_ENUM",
  "INVALID_ANSWER_TYPE",
  "ANSWER_STRUCTURE_INVALID",
  "ANSWER_UNRESOLVABLE_ID",
  "ANSWER_NOT_NORMALIZABLE",
  "ANSWER_MISMATCH",
  "MULTIPLE_VALID_OPTIONS",
  "NO_VALID_OPTION",
  "DUPLICATE_OPTION",
  "OPTION_STRUCTURE_INVALID",
  "SEMANTIC_OPTION_EQUIVALENCE",
  "SOLUTION_MISSING",
  "SOLUTION_UNPARSEABLE",
  "SOLUTION_MISMATCH",
  "SOLUTION_STEP_INVALID",
  "MATH_INVALID",
  "MATH_DERIVATION_UNAVAILABLE",
  "MULTI_SOURCE_DISAGREEMENT",
  "LOGIC_INVALID",
  "LOGIC_NO_SOLUTION",
  "LOGIC_MULTIPLE_SOLUTIONS",
  "CONSTRAINT_CONFLICT",
  "UNIT_MISMATCH",
  "UNIT_UNKNOWN_DIMENSION",
  "PERCENTAGE_REPRESENTATION_MISMATCH",
  "SKILL_MISMATCH",
  "SKILL_UNRESOLVABLE",
  "LEARNING_OBJECTIVE_MISMATCH",
  "DIFFICULTY_METADATA_INVALID",
  "DIFFICULTY_IMPLAUSIBLE",
  "BROKEN_ASSET",
  "ASSET_VERSION_MISMATCH",
  "LATEX_RENDER_FAILURE",
  "LATEX_UNSAFE_COMMAND",
  "UNSAFE_MARKUP",
  "SCORING_INCOMPATIBLE",
  "ASSESSMENT_INCOMPATIBLE",
  "MODE_INELIGIBLE",
  "STALE_VALIDATION",
  "VALIDATOR_TIMEOUT",
  "VALIDATOR_UNAVAILABLE",
  "VALIDATOR_INTERNAL_ERROR",
  "DEPENDENCY_FAILED",
  "AI_UNAVAILABLE",
  "AI_OUTPUT_INVALID",
  "AI_REVIEW_SUGGESTED",
  "RC_EVIDENCE_UNGROUNDED"
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

// ---------------------------------------------------------------------------
// Roles (spec §151) — reused across access control and audit.
// ---------------------------------------------------------------------------
export const ROLES = ["STUDENT", "TRAINER", "CONTENT_EDITOR", "REVIEWER", "ADMIN", "SYSTEM"] as const;
export type Role = (typeof ROLES)[number];

// ---------------------------------------------------------------------------
// The validation contract itself (spec §11)
// ---------------------------------------------------------------------------
export interface ValidationResult {
  validator: string; // e.g. "MATH_VALIDATOR"
  category: ValidatorCategory;
  status: ValidationState;
  severity: Severity;
  code: ErrorCode;
  message: string;
  /** Structured evidence. Kept free-form per-validator but always JSON-serializable. */
  evidence: Record<string, unknown>;
  validatorVersion: string;
  validatedAt: string; // ISO-8601
  durationMs: number;
  /** Present only when status === "SKIPPED" and the reason was an upstream dependency failure. */
  skippedReason?: string;
}

/** Input every validator receives. Concrete validators narrow `context` as needed. */
export interface ValidatorInput {
  questionVersion: QuestionVersionSnapshot;
  mode: ValidationMode;
  context: ValidationContext;
}

export interface ValidationContext {
  tenantId: string | null; // null = global content (spec §152)
  requestedBy: { role: Role; id: string };
  /** Results already produced earlier in this run, keyed by validator name — lets a
   *  validator consult an upstream result (e.g. AnswerValidator reading SchemaValidator's
   *  evidence) without re-deriving it. */
  upstreamResults: ReadonlyMap<string, ValidationResult>;
  /** Ported ACEAPT services this validator may call. See src/ports/README for what's real vs. stubbed. */
  ports: ValidationPorts;
}

/** Everything Feature 54 depends on from the rest of ACEAPT but does not own.
 *  In this delivery these are documented ports (see TRUTH_TABLE.md) — real interfaces,
 *  dev-mode implementations, because no ACEAPT repository was reachable in this session. */
export interface ValidationPorts {
  skillGraph: SkillGraphPort;
  scoringNormalizer: ScoringNormalizerPort;
  assetStore: AssetStorePort;
}

export interface SkillGraphPort {
  resolveSkill(skillId: string): Promise<{ id: string; name: string; operationSignature: string[] } | null>;
}

export interface ScoringNormalizerPort {
  /** Mirrors the grading engine's normalization so validation can never approve a question
   *  whose answer format the grader can't actually interpret (spec §28, §72). */
  supports(answerType: AnswerType): boolean;
  normalize(answerType: AnswerType, raw: unknown): { ok: true; normalized: unknown } | { ok: false; reason: string };
}

export interface AssetStorePort {
  exists(assetRef: string, version: string): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// Answer types (spec §21) — do not assume MCQ-only.
// ---------------------------------------------------------------------------
export const ANSWER_TYPES = [
  "SINGLE_SELECT",
  "MULTI_SELECT",
  "NUMERIC",
  "DECIMAL",
  "FRACTION",
  "PERCENTAGE",
  "TEXT",
  "TRUE_FALSE",
  "MATCHING",
  "ORDERING",
  "FILL_IN_BLANK"
] as const;
export type AnswerType = (typeof ANSWER_TYPES)[number];

// ---------------------------------------------------------------------------
// Skill domains used by MathValidator dispatch (spec §39)
// ---------------------------------------------------------------------------
export const QUANT_DOMAINS = [
  "ARITHMETIC",
  "PERCENTAGE",
  "RATIO",
  "AVERAGE",
  "PROFIT_LOSS",
  "SIMPLE_INTEREST",
  "COMPOUND_INTEREST",
  "TIME_WORK",
  "SPEED_DISTANCE",
  "ALGEBRA",
  "GEOMETRY",
  "PERMUTATION_COMBINATION",
  "PROBABILITY",
  "DATA_INTERPRETATION"
] as const;
export type QuantDomain = (typeof QUANT_DOMAINS)[number];

// ---------------------------------------------------------------------------
// Question version snapshot — the PORTED shape of "the thing being validated."
// This is intentionally the minimal superset needed to drive every validator in
// this delivery. See TRUTH_TABLE.md: the real Question/QuestionVersion/Answer/
// Option/Solution/Skill/Difficulty models live in the actual ACEAPT repo, which
// was not reachable this session, so this is a documented port, not a guess
// dressed up as the real schema.
// ---------------------------------------------------------------------------
export interface OptionSnapshot {
  id: string;
  text: string;
  /** Numeric value backing the option where applicable — lets OptionsValidator
   *  detect semantic equivalence (0.5 / 1/2 / 50%) without string-matching. */
  numericValue?: number;
}

export interface SolutionStep {
  id: string;
  order: number;
  /** Free-text description shown to the student. */
  text: string;
  /** Optional machine-checkable expression for this step, e.g. "500 * 0.20". */
  expression?: string;
  /** Optional declared numeric result of this step, checked against `expression` when both are present. */
  expectedValue?: number;
}

export interface SolutionSnapshot {
  finalAnswer?: string | number;
  /** Optional machine-checkable expression whose evaluation should equal finalAnswer. */
  finalExpression?: string;
  /** Unit the author expressed finalAnswer in, when the question has a units contract
   *  (spec §26 — "6 hours" vs "360 minutes"). Defaults to the question's expected unit
   *  when omitted, i.e. "author didn't say otherwise, assume no unit mismatch." */
  unitOfFinalAnswer?: string;
  steps: SolutionStep[];
}

export interface DerivationSpec {
  domain: QuantDomain;
  /** A mathjs-evaluable expression using only the variables in `variables`. */
  expression?: string;
  variables?: Record<string, number>;
  /** Question-specific absolute tolerance for numeric comparison (spec §24 — never
   *  a single global tolerance). Defaults to a small epsilon when omitted. */
  tolerance?: number;
  /** For LOGIC domain puzzles expressed as a small CSP (see LogicValidator). */
  csp?: LogicPuzzleSpec;
  /** For GEOMETRY: a named formula + inputs (see GeometryValidator). */
  formula?: { name: string; inputs: Record<string, number> };
  /** For PROBABILITY: explicit favorable/total counts when known. */
  probability?: { favorable: number; total: number };
  /** For DATA_INTERPRETATION: a small table + an operation over it. */
  dataInterpretation?: { table: number[][]; operation: "sum" | "average" | "max" | "min" | "percentageChange"; args?: number[] };
}

export interface LogicPuzzleSpec {
  entities: string[];
  attributes: Record<string, string[]>; // attribute name -> domain values
  constraints: LogicConstraint[];
  /** What the declared answer claims to resolve — "entity E's value for attribute A". */
  query: { entity: string; attribute: string };
}

export type LogicConstraint =
  | { type: "ALL_DIFFERENT"; attribute: string }
  | { type: "EQUALS"; entity: string; attribute: string; value: string }
  | { type: "NOT_EQUALS"; entity: string; attribute: string; value: string }
  | { type: "SAME"; entityA: string; entityB: string; attribute: string }
  | { type: "DIFFERENT"; entityA: string; entityB: string; attribute: string };

export interface QuestionVersionSnapshot {
  questionId: string;
  versionId: string;
  /** Monotonic per-question version number, used for stale detection (spec §57–§59). */
  versionNumber: number;
  tenantId: string | null;
  isGlobal: boolean;
  status: "DRAFT" | "PUBLISHED" | "SUSPENDED" | "RETIRED";
  purpose: string;
  questionText: string;
  answerType: AnswerType;
  answer: unknown;
  options?: OptionSnapshot[];
  solution?: SolutionSnapshot;
  derivation?: DerivationSpec;
  units?: { expected: string; allowEquivalentForms: boolean };
  skill: { primarySkillId: string; secondarySkillIds: string[] };
  difficulty: { band: "EASY" | "MEDIUM" | "HARD"; numericValue?: number };
  assets: { ref: string; version: string; kind: "IMAGE" | "TABLE" | "CHART" }[];
  passage?: { text: string; evidenceSpan?: string };
  renderBlocks: { kind: "MARKDOWN" | "LATEX" | "HTML"; content: string }[];
  origin: "HUMAN_AUTHORED" | "AI_GENERATED" | "IMPORTED" | "ADAPTED";
  /** Set once the question is published; the delivery gate must never let edits
   *  silently mutate a version an assessment already bound to (spec §110, §148). */
  immutableSinceAssessmentUse: boolean;
  /** Content hash of the fields above, used for identity/caching/stale-detection. Computed
   *  by src/hashing/contentHash.ts — callers should not hand-compute this. */
  contentHash: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Overall aggregation output (spec §88–§93)
// ---------------------------------------------------------------------------
export const OVERALL_STATUSES = [
  "VALID",
  "VALID_WITH_WARNINGS",
  "REVIEW_REQUIRED",
  "INVALID",
  "VALIDATION_ERROR",
  "STALE"
] as const;
export type OverallStatus = (typeof OVERALL_STATUSES)[number];

export interface EligibilityByMode {
  practice: boolean;
  timed: boolean;
  assessment: boolean;
}

export interface ValidationRunResult {
  runId: string;
  questionId: string;
  versionId: string;
  versionNumber: number;
  mode: ValidationMode;
  profile: string;
  startedAt: string;
  completedAt: string;
  results: ValidationResult[];
  overallStatus: OverallStatus;
  highestSeverity: Severity;
  blockingCodes: ErrorCode[];
  eligibility: EligibilityByMode;
  contentHash: string;
  validatorVersionSet: Record<string, string>;
}

export function isTerminalState(state: ValidationState): boolean {
  return state !== "RUNNING" && state !== "NOT_RUN";
}
