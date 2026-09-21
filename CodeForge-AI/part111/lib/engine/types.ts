export const VERDICTS = [
  "ACCEPTED",
  "WRONG_ANSWER",
  "TIME_LIMIT_EXCEEDED",
  "MEMORY_LIMIT_EXCEEDED",
  "RUNTIME_ERROR",
  "COMPILATION_ERROR",
  "OUTPUT_LIMIT_EXCEEDED",
  "SYSTEM_ERROR",
  "JUDGE_ERROR",
] as const;
export type Verdict = (typeof VERDICTS)[number];

/** Verdicts that reflect something true about the *student's code*. */
export const STUDENT_FAULT_VERDICTS: ReadonlySet<Verdict> = new Set([
  "WRONG_ANSWER",
  "TIME_LIMIT_EXCEEDED",
  "MEMORY_LIMIT_EXCEEDED",
  "RUNTIME_ERROR",
  "COMPILATION_ERROR",
  "OUTPUT_LIMIT_EXCEEDED",
]);

/** Verdicts that reflect an *infrastructure* problem — must never affect score as if the student failed. */
export const INFRASTRUCTURE_VERDICTS: ReadonlySet<Verdict> = new Set([
  "SYSTEM_ERROR",
  "JUDGE_ERROR",
]);

export interface CheckerConfig {
  kind: "exact" | "whitespace_normalized" | "numeric_tolerance" | "structured" | "custom";
  absTolerance?: number;
  relTolerance?: number;
}

export interface TestCaseSpec {
  id: string;
  category:
    | "basic"
    | "boundary"
    | "edge"
    | "adversarial"
    | "large_input"
    | "performance"
    | "regression"
    | "special_condition";
  weight: number;
  inputData: string;
  expectedOutput: string;
  checker: CheckerConfig;
  isPublic: boolean;
  limits: { timeMs: number; memoryMb: number; outputKb: number };
}

export interface TestOutcome {
  testCaseId: string;
  category: TestCaseSpec["category"];
  weight: number;
  isPublic: boolean;
  verdict: Verdict;
  execTimeMs: number;
  memoryKb: number | null;
  outputSizeBytes: number;
  exitCode: number | null;
  internalNote: string;
}

export interface EvaluationPolicy {
  earlyTermination: "none" | "stop_on_first_critical_failure";
  /** Categories whose failure counts as "critical" under stop_on_first_critical_failure. */
  criticalCategories: TestCaseSpec["category"][];
  assessmentMode: "learning" | "practice" | "assessment" | "interview";
}

export interface AggregateResult {
  overallVerdict: Verdict;
  score: number;
  maxScore: number;
  passedCount: number;
  failedCount: number;
  totalCount: number;
  categoryResults: Record<string, { passed: number; total: number }>;
  outcomes: TestOutcome[];
}
