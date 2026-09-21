import { SupportedLanguage, TestOutcome } from "../../src/domain/enums.js";
import type { ExecutionEvidence, SubmissionRef, TestResult } from "../../src/domain/types.js";

export function ref(overrides: Partial<SubmissionRef> = {}): SubmissionRef {
  return {
    submissionId: "sub_1",
    submissionVersion: "v1",
    problemId: "problem_two_sum",
    userId: "user_alice",
    language: SupportedLanguage.PYTHON,
    ...overrides,
  };
}

export function test(id: string, outcome: TestOutcome, tags: string[] = [], extra: Partial<TestResult> = {}): TestResult {
  return { id, outcome, tags, hidden: true, ...extra };
}

export function evidence(overrides: Partial<ExecutionEvidence> = {}): ExecutionEvidence {
  return {
    ref: ref(),
    compilation: null,
    tests: null,
    executedAt: new Date().toISOString(),
    ...overrides,
  };
}
