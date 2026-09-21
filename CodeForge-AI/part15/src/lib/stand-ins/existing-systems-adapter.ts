/**
 * ============================================================================
 * STAND-IN — NOT PART OF THE HINT LADDER DELIVERABLE
 * ============================================================================
 * This file exists ONLY because no existing CodeForge repository was
 * available to inspect/reuse in this environment (see README.md). It
 * defines the minimal read-only shape the real problem/submission/
 * execution/coaching-session systems would already provide, so the Hint
 * Ladder has something real to integrate against and its integration
 * points are concrete rather than hand-wavy.
 *
 * When merging into the real CodeForge repo: DELETE this file and point
 * src/lib/hint-ladder/service.ts's `ExistingSystemsAdapter` at the real
 * problem/submission/execution/coaching-session modules instead. Nothing
 * in src/lib/hint-ladder/* imports this file directly — service.ts only
 * depends on the ExistingSystemsAdapter interface, and this file is one
 * (fake, in-memory) implementation of it, wired up only in
 * src/app/api/hint-ladder/* and the demo workspace page.
 * ============================================================================
 */

import { ExecutionEvidence, ProblemContext, SubmissionSnapshot } from "../hint-ladder/types";

export interface ExistingSystemsAdapter {
  getProblem(problemId: string): Promise<ProblemContext | null>;
  getLatestSubmission(studentId: string, problemId: string): Promise<SubmissionSnapshot | null>;
  getLatestExecutionResult(studentId: string, problemId: string): Promise<ExecutionEvidence | null>;
  /** Resolves the CURRENT product mode for this attempt server-side. Never trust a client-supplied mode. */
  resolveMode(studentId: string, problemId: string): Promise<"PRACTICE" | "ASSESSMENT" | "INTERVIEW">;
  /** Feature 14 (AI Code Coach) link, if one exists for this attempt — reused, not duplicated. */
  getActiveCoachingSessionId(studentId: string, problemId: string): Promise<string | null>;
}

const DEMO_PROBLEM: ProblemContext = {
  problemId: "demo-sum-array",
  title: "Sum of Array Elements",
  statement:
    "Given an array of integers nums, return the sum of all elements in the array. Your solution should visit every valid index exactly once.",
  constraints: ["1 <= nums.length <= 10^4", "-1000 <= nums[i] <= 1000"],
  examples: [
    { input: "[1,2,3]", output: "6" },
    { input: "[5]", output: "5" },
    { input: "[-1,1]", output: "0" },
  ],
  entryPointHints: ["solve", "sumArray"],
  language: "python",
};

/**
 * In-memory demo adapter. Lets the workspace page and API routes be
 * exercised end-to-end without a real CodeForge backend attached. Swap
 * for a real adapter backed by the actual problems/submissions/
 * execution_results/coaching_sessions tables in production.
 */
export class DemoExistingSystemsAdapter implements ExistingSystemsAdapter {
  private submissions = new Map<string, SubmissionSnapshot>();
  private executions = new Map<string, ExecutionEvidence>();

  async getProblem(problemId: string): Promise<ProblemContext | null> {
    return problemId === DEMO_PROBLEM.problemId ? DEMO_PROBLEM : null;
  }

  async getLatestSubmission(studentId: string, problemId: string): Promise<SubmissionSnapshot | null> {
    return this.submissions.get(`${studentId}:${problemId}`) ?? null;
  }

  async getLatestExecutionResult(studentId: string, problemId: string): Promise<ExecutionEvidence | null> {
    return this.executions.get(`${studentId}:${problemId}`) ?? null;
  }

  async resolveMode(): Promise<"PRACTICE" | "ASSESSMENT" | "INTERVIEW"> {
    return "PRACTICE";
  }

  async getActiveCoachingSessionId(): Promise<string | null> {
    return null;
  }

  /** Demo-only helper for the workspace page's "run" button — a real deployment's execution system calls into this integration point instead. */
  recordSubmission(studentId: string, problemId: string, submission: SubmissionSnapshot, execution: ExecutionEvidence) {
    this.submissions.set(`${studentId}:${problemId}`, submission);
    this.executions.set(`${studentId}:${problemId}`, execution);
  }
}
