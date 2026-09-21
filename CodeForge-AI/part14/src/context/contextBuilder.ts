import type {
  AssembledCoachingContext,
  CodeContext,
  CoachingPolicyMode,
  CoachingRequest,
  CoachingStateSnapshot,
  ExecutionEvidence,
  ProblemContext,
  SubmissionHistoryEntry,
  Verdict,
} from "../types";

/**
 * Shape of a problem record as CodeForge's database would actually have it.
 * hiddenTests/referenceSolution are declared here because the *caller* will
 * have them — buildCoachingContext below never reads those two fields, by
 * construction, so they cannot end up in a prompt no matter what future
 * code changes elsewhere.
 */
export interface RawProblem {
  id: string;
  title: string;
  statement: string;
  constraints: string[];
  publicExamples: { input: string; output: string }[];
  hiddenTests?: unknown;
  referenceSolution?: unknown;
  languageRestrictions?: string[];
  evaluationRules?: string;
}

export interface RawExecutionResult {
  executed: boolean;
  verdict: Verdict;
  publicTestsPassed?: number;
  publicTestsTotal?: number;
  hiddenTestsPassed?: number;
  hiddenTestsTotal?: number;
  visibleFailedTestIndices?: number[];
  compilerError?: string;
  runtimeError?: string;
  timeMs?: number;
  memoryKb?: number;
  timedOut?: boolean;
  memoryExceeded?: boolean;
  executionRecordId?: string;
}

export interface ContextBuilderInput {
  problem: RawProblem;
  code: { language: string; source: string };
  latestExecution: RawExecutionResult | null;
  history: SubmissionHistoryEntry[];
  state: CoachingStateSnapshot;
  request: CoachingRequest;
  policyMode: CoachingPolicyMode;
  maxSourceChars?: number;
}

const MAX_SOURCE_CHARS_DEFAULT = 6000;

export function buildCoachingContext(input: ContextBuilderInput): AssembledCoachingContext {
  const problem: ProblemContext = {
    problemId: input.problem.id,
    title: input.problem.title,
    statement: input.problem.statement,
    constraints: input.problem.constraints,
    examples: input.problem.publicExamples,
    languageRestrictions: input.problem.languageRestrictions,
    evaluationRules: input.problem.evaluationRules,
  };
  // input.problem.hiddenTests / .referenceSolution intentionally never read.

  const maxChars = input.maxSourceChars ?? MAX_SOURCE_CHARS_DEFAULT;
  const source =
    input.code.source.length > maxChars
      ? input.code.source.slice(0, maxChars) + "\n/* …truncated for context window… */"
      : input.code.source;
  const code: CodeContext = { language: input.code.language, source };

  const evidence: ExecutionEvidence = input.latestExecution
    ? {
        hasExecuted: input.latestExecution.executed,
        verdict: input.latestExecution.executed ? input.latestExecution.verdict : "NO_EXECUTION",
        testsPassed: input.latestExecution.publicTestsPassed,
        testsTotal: input.latestExecution.publicTestsTotal,
        visibleFailedTestIndices: input.latestExecution.visibleFailedTestIndices,
        hiddenEvaluationFailed: computeHiddenEvaluationFailed(input.latestExecution),
        compilerError: input.latestExecution.compilerError,
        runtimeError: input.latestExecution.runtimeError,
        timeMs: input.latestExecution.timeMs,
        memoryKb: input.latestExecution.memoryKb,
        timedOut: input.latestExecution.timedOut,
        memoryExceeded: input.latestExecution.memoryExceeded,
        executionRecordId: input.latestExecution.executionRecordId,
        raw: null,
      }
    : { hasExecuted: false, verdict: "NO_EXECUTION", raw: null };

  return {
    problem,
    code,
    evidence,
    history: input.history,
    state: input.state,
    request: input.request,
    policyMode: input.policyMode,
  };
}

/** Only ever surfaces a boolean signal ("some hidden cases failed") — never counts or details. */
function computeHiddenEvaluationFailed(exec: RawExecutionResult): boolean | undefined {
  if (exec.hiddenTestsPassed === undefined || exec.hiddenTestsTotal === undefined) return undefined;
  return exec.hiddenTestsPassed < exec.hiddenTestsTotal;
}
