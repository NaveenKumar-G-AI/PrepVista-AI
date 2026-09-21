/**
 * CodeForge AI — Submission System
 * Deterministic verdict classification. Per the spec: "AI is NOT required for
 * deterministic submission processing... AI must never determine the authoritative
 * verdict, score, execution result, or submission status." Nothing in this file, or
 * anything it calls, makes a network call or an LLM call — it is pure computation over
 * RunResult objects the execution provider already produced.
 *
 * The output checker is dependency-injected (`CheckerFn`) rather than hard-coded to
 * exact-string-match, because CodeForge's real checker system (float tolerance, special
 * judges, multiple valid answers) is an existing subsystem this module integrates with,
 * not one it should reimplement — see spec: "do not duplicate existing systems."
 * defaultChecker below is the fallback used by tests and by problems that don't need a
 * custom checker.
 */
import type { ExecutionConfig, HiddenResult, PublicResult, PublicTestCaseResult } from '../domain/types.js';
import type { RunResult } from '../execution/executionProvider.js';
import type { Verdict } from '../domain/enums.js';

export type CheckerFn = (actualOutput: string, expectedOutput: string, testInput: string) => boolean;

function normalizeForCompare(s: string): string {
  return s
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, '')) // trailing whitespace per line
    .join('\n')
    .replace(/\n+$/g, ''); // trailing blank lines
}

export const defaultChecker: CheckerFn = (actual, expected) => normalizeForCompare(actual) === normalizeForCompare(expected);

/** Per-case classification, before any aggregation. Priority order matters: a timeout
 * that also happens to produce wrong output is reported as TLE, not WA — the student
 * needs to know *why* it failed, and TLE is the more actionable/accurate signal. */
export type SingleCaseVerdict = 'ACCEPTED' | 'WRONG_ANSWER' | 'RUNTIME_ERROR' | 'TIME_LIMIT_EXCEEDED' | 'MEMORY_LIMIT_EXCEEDED' | 'OUTPUT_LIMIT_EXCEEDED';

export function classifySingleRun(
  runResult: RunResult,
  config: ExecutionConfig,
  expectedOutput: string,
  testInput: string,
  checker: CheckerFn = defaultChecker,
): SingleCaseVerdict {
  if (runResult.timedOut) return 'TIME_LIMIT_EXCEEDED';
  // Authoritative MLE check: real /proc-measured RSS against the ORIGINAL declared
  // limit — never against a runtime-floor-adjusted ulimit value (see
  // localProcessExecutionProvider.ts's run(), which keeps these deliberately separate).
  if (runResult.memoryKb >= config.memoryLimitKb) return 'MEMORY_LIMIT_EXCEEDED';
  if (runResult.outputTruncated) return 'OUTPUT_LIMIT_EXCEEDED';
  if (runResult.exitCode !== 0 || runResult.signal !== null) return 'RUNTIME_ERROR';
  return checker(runResult.stdout, expectedOutput, testInput) ? 'ACCEPTED' : 'WRONG_ANSWER';
}

// Worst-first — used to pick ONE overall verdict when multiple cases fail differently.
const VERDICT_SEVERITY: SingleCaseVerdict[] = [
  'RUNTIME_ERROR',
  'MEMORY_LIMIT_EXCEEDED',
  'TIME_LIMIT_EXCEEDED',
  'OUTPUT_LIMIT_EXCEEDED',
  'WRONG_ANSWER',
  'ACCEPTED',
];

export function worstVerdict(verdicts: SingleCaseVerdict[]): SingleCaseVerdict {
  if (verdicts.length === 0) return 'ACCEPTED';
  for (const candidate of VERDICT_SEVERITY) {
    if (verdicts.includes(candidate)) return candidate;
  }
  return 'ACCEPTED';
}

export interface PublicCaseOutcome {
  name: string;
  verdict: SingleCaseVerdict;
  wallMs: number;
}

export function buildPublicResult(outcomes: PublicCaseOutcome[]): PublicResult {
  const cases: PublicTestCaseResult[] = outcomes.map((o) => ({ name: o.name, passed: o.verdict === 'ACCEPTED', wallMs: o.wallMs }));
  return {
    totalTests: cases.length,
    passed: cases.filter((c) => c.passed).length,
    failed: cases.filter((c) => !c.passed).length,
    cases,
  };
}

export interface HiddenGroupOutcome {
  weight: number;
  allCasesPassed: boolean;
}

/** AGGREGATE ONLY by construction — HiddenResult's type has no field for per-case
 * detail, inputs, outputs, ids, or checker internals, so there is nothing here that
 * could leak even if this function were called with more data than it needs. */
export function buildHiddenResult(groupOutcomes: HiddenGroupOutcome[]): HiddenResult {
  const totalWeight = groupOutcomes.reduce((sum, g) => sum + g.weight, 0);
  const earnedWeight = groupOutcomes.reduce((sum, g) => sum + (g.allCasesPassed ? g.weight : 0), 0);
  return {
    totalGroups: groupOutcomes.length,
    passedGroups: groupOutcomes.filter((g) => g.allCasesPassed).length,
    totalWeight,
    earnedWeight,
  };
}

export function computeScore(hiddenResult: HiddenResult, publicResult: PublicResult): number {
  if (hiddenResult.totalWeight > 0) {
    return Math.round((hiddenResult.earnedWeight / hiddenResult.totalWeight) * 10000) / 100; // 2dp
  }
  if (publicResult.totalTests > 0) {
    return Math.round((publicResult.passed / publicResult.totalTests) * 10000) / 100;
  }
  return 0;
}

export interface OverallVerdictInput {
  compilationStatus: 'NOT_REQUIRED' | 'SUCCESS' | 'FAILED';
  publicCaseVerdicts: SingleCaseVerdict[];
  hiddenCaseVerdicts: SingleCaseVerdict[];
}

export function determineOverallVerdict(input: OverallVerdictInput): Verdict {
  if (input.compilationStatus === 'FAILED') return 'COMPILATION_ERROR';
  const worst = worstVerdict([...input.publicCaseVerdicts, ...input.hiddenCaseVerdicts]);
  return worst; // SingleCaseVerdict values are a strict subset of Verdict's string union
}
