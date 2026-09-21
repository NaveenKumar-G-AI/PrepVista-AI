import { ExecutionEvidence, ProblemContext, SubmissionSnapshot } from "@/lib/hint-ladder/types";

export const GOLDEN_PROBLEM: ProblemContext = {
  problemId: "golden-sum-array",
  title: "Sum of Array Elements",
  statement: "Given an array of integers nums, return the sum of all elements, visiting every valid index exactly once.",
  constraints: ["1 <= nums.length <= 10^4"],
  examples: [{ input: "[1,2,3]", output: "6" }],
  entryPointHints: ["solve"],
  language: "python",
};

export const GOLDEN_SUBMISSION_1: SubmissionSnapshot = {
  submissionId: "golden-sub-1",
  language: "python",
  createdAt: "2026-01-01T10:00:00.000Z",
  code: ["def solve(nums):", "    total = 0", "    for i in range(len(nums) - 1):", "        total += nums[i]", "    return total"].join("\n"),
};

export const GOLDEN_EXECUTION_1: ExecutionEvidence = {
  submissionId: "golden-sub-1",
  verdict: "WRONG_ANSWER",
  testsPassed: 6,
  testsTotal: 10,
  compilerError: null,
  runtimeError: null,
  stackTrace: null,
  failingPublicCases: [{ input: "[1,2,3]", expected: "6", actual: "3" }],
  createdAt: "2026-01-01T10:00:05.000Z",
};

// Student partially fixes the loop bound but a second, related off-by-one
// remains (still not iterating the very first OR very last element
// correctly, depending on interpretation) — deliberately still WRONG_ANSWER
// with an improved pass count, per the spec's exact fixture numbers.
export const GOLDEN_SUBMISSION_2: SubmissionSnapshot = {
  submissionId: "golden-sub-2",
  language: "python",
  createdAt: "2026-01-01T10:05:00.000Z",
  code: ["def solve(nums):", "    total = 0", "    for i in range(1, len(nums)):", "        total += nums[i]", "    return total"].join("\n"),
};

export const GOLDEN_EXECUTION_2: ExecutionEvidence = {
  submissionId: "golden-sub-2",
  verdict: "WRONG_ANSWER",
  testsPassed: 7,
  testsTotal: 10,
  compilerError: null,
  runtimeError: null,
  stackTrace: null,
  failingPublicCases: [{ input: "[5]", expected: "5", actual: "0" }],
  createdAt: "2026-01-01T10:05:05.000Z",
};

export const GOLDEN_SUBMISSION_3: SubmissionSnapshot = {
  submissionId: "golden-sub-3",
  language: "python",
  createdAt: "2026-01-01T10:10:00.000Z",
  code: ["def solve(nums):", "    total = 0", "    for i in range(len(nums)):", "        total += nums[i]", "    return total"].join("\n"),
};

export const GOLDEN_EXECUTION_3: ExecutionEvidence = {
  submissionId: "golden-sub-3",
  verdict: "ACCEPTED",
  testsPassed: 10,
  testsTotal: 10,
  compilerError: null,
  runtimeError: null,
  stackTrace: null,
  failingPublicCases: null,
  createdAt: "2026-01-01T10:10:05.000Z",
};
