import { beforeEach, describe, expect, it } from "vitest";
import { handleHintRequest } from "@/lib/hint-ladder/service";
import { InMemoryHintLadderRepository } from "@/lib/hint-ladder/repository/in-memory-repository";
import { InMemorySlidingWindowRateLimiter } from "@/lib/hint-ladder/rate-limit";
import { ProviderRouter } from "@/lib/hint-ladder/providers/router";
import { FakeProvider } from "@/lib/hint-ladder/providers/fake-provider";
import { DEFAULT_MODE_POLICY_LIMITS } from "@/lib/hint-ladder/policy-engine";
import { ExistingSystemsAdapter } from "@/lib/stand-ins/existing-systems-adapter";
import { ExecutionEvidence, ProblemContext, SubmissionSnapshot } from "@/lib/hint-ladder/types";
import {
  GOLDEN_EXECUTION_1,
  GOLDEN_EXECUTION_2,
  GOLDEN_EXECUTION_3,
  GOLDEN_PROBLEM,
  GOLDEN_SUBMISSION_1,
  GOLDEN_SUBMISSION_2,
  GOLDEN_SUBMISSION_3,
} from "../fixtures/golden-scenario-fixtures";

/** Test-only adapter whose submission/execution state is advanced explicitly by the test, simulating the student editing and resubmitting between hint requests. */
class ScriptedAdapter implements ExistingSystemsAdapter {
  private submission: SubmissionSnapshot | null = null;
  private execution: ExecutionEvidence | null = null;

  setSubmission(submission: SubmissionSnapshot, execution: ExecutionEvidence) {
    this.submission = submission;
    this.execution = execution;
  }
  async getProblem(problemId: string): Promise<ProblemContext | null> {
    return problemId === GOLDEN_PROBLEM.problemId ? GOLDEN_PROBLEM : null;
  }
  async getLatestSubmission() {
    return this.submission;
  }
  async getLatestExecutionResult() {
    return this.execution;
  }
  async resolveMode(): Promise<"PRACTICE"> {
    return "PRACTICE";
  }
  async getActiveCoachingSessionId() {
    return null;
  }
}

/** Fake provider that returns a schema-valid, level-appropriate hint reflecting whatever level/type the policy engine assigned — mirrors how a real model would respond to the prompt's assigned_assistance_level, without needing a live call. */
function makeFakeProvider() {
  return new FakeProvider((params) => {
    const levelMatch = params.userPrompt.match(/assigned_assistance_level:\s*(\w+)/);
    const typeMatch = params.userPrompt.match(/assigned_hint_type:\s*(\w+)/);
    const level = levelMatch?.[1] ?? "DIRECTION";
    const hintType = typeMatch?.[1] ?? "DIRECTION";
    const hintsByLevel: Record<string, string> = {
      DIRECTION: "Look closely at how your loop handles the final valid element.",
      CONCEPT: "Think about the relationship between a collection's size and its valid index range.",
      TARGETED: "Focus on the condition controlling your loop.",
      SPECIFIC: "Your loop's range may be excluding an index it should include.",
    };
    return JSON.stringify({
      assistance_level: level,
      hint_type: hintType,
      concept: "BOUNDARY_CONDITION",
      observation: "The submission is not yet passing all tests.",
      hint: hintsByLevel[level] ?? "Consider the boundary of your iteration.",
      target_area: "solve() loop",
      confidence: "MEDIUM",
      teaching_objective: "Understand the valid index range.",
      next_action: "await_student_response",
      solution_revealed: false,
    });
  });
}

describe("Golden end-to-end scenario (6/10 -> 7/10 -> 10/10)", () => {
  let repository: InMemoryHintLadderRepository;
  let adapter: ScriptedAdapter;
  let router: ProviderRouter;
  let deps: Parameters<typeof handleHintRequest>[0]["deps"];

  beforeEach(() => {
    repository = new InMemoryHintLadderRepository();
    adapter = new ScriptedAdapter();
    router = new ProviderRouter({ groq: makeFakeProvider() }, { primary: "groq", timeoutMs: 5000 });
    deps = {
      repository,
      existingSystems: adapter,
      router,
      rateLimiter: new InMemorySlidingWindowRateLimiter(1, 1000), // effectively unlimited for this test
      modeLimits: DEFAULT_MODE_POLICY_LIMITS,
      now: () => new Date().toISOString(),
    };
  });

  it("walks the full adaptive loop exactly as specified, using only fixture values", async () => {
    const studentId = "student-golden-1";

    // --- Step 1: student submits, execution reports 6/10 (from fixture) ---
    adapter.setSubmission(GOLDEN_SUBMISSION_1, GOLDEN_EXECUTION_1);
    expect(GOLDEN_EXECUTION_1.testsPassed).toBe(6);
    expect(GOLDEN_EXECUTION_1.testsTotal).toBe(10);

    // --- Step 2: student requests help -> directional hint -------------
    const firstResponse = await handleHintRequest({
      deps,
      studentId,
      input: { requestId: "req-1", problemId: GOLDEN_PROBLEM.problemId, action: "REQUEST_HELP" },
    });
    expect(firstResponse.kind).toBe("DELIVER_FIRST_HINT");
    expect(firstResponse.currentLevel).toBe("DIRECTION");
    expect(firstResponse.hint).not.toBeNull();
    expect(firstResponse.hint!.source).toBe("AI_GENERATED");
    const firstHintText = firstResponse.hint!.text;

    // --- Step 3: student changes relevant code, resubmits -> 7/10 (fixture) ---
    adapter.setSubmission(GOLDEN_SUBMISSION_2, GOLDEN_EXECUTION_2);
    expect(GOLDEN_EXECUTION_2.testsPassed).toBe(7);

    // --- Step 4: student asks again -> system recognizes partial improvement, gives a MORE TARGETED hint, does not repeat itself ---
    const secondResponse = await handleHintRequest({
      deps,
      studentId,
      input: { requestId: "req-2", problemId: GOLDEN_PROBLEM.problemId, action: "REQUEST_HELP" },
    });
    expect(secondResponse.kind).toBe("ACKNOWLEDGE_PROGRESS_AND_CONTINUE");
    expect(secondResponse.templatedMessage).toContain("6/10");
    expect(secondResponse.templatedMessage).toContain("7/10");
    expect(secondResponse.hint).not.toBeNull();
    expect(secondResponse.hint!.text).not.toBe(firstHintText); // never repeats the identical hint
    // Same underlying issue (BOUNDARY_CONDITION persisted) -> ladder moved deeper than DIRECTION.
    expect(["CONCEPT", "TARGETED", "SPECIFIC", "DETAILED"]).toContain(secondResponse.currentLevel);

    // --- Step 5: student changes code again, resubmits -> 10/10 (fixture) ---
    adapter.setSubmission(GOLDEN_SUBMISSION_3, GOLDEN_EXECUTION_3);
    expect(GOLDEN_EXECUTION_3.verdict).toBe("ACCEPTED");
    expect(GOLDEN_EXECUTION_3.testsPassed).toBe(10);

    // --- Step 6: system recognizes resolution --------------------------
    const thirdResponse = await handleHintRequest({
      deps,
      studentId,
      input: { requestId: "req-3", problemId: GOLDEN_PROBLEM.problemId, action: "REQUEST_HELP" },
    });
    expect(thirdResponse.kind).toBe("RESOLVED");
    expect(thirdResponse.status).toBe("RESOLVED");
    expect(thirdResponse.hint).toBeNull(); // no new hint generated once resolved
    expect(thirdResponse.templatedMessage).toContain("10/10");

    // --- Step 7: no unnecessary further escalation — asking again after resolution does not escalate or regenerate ---
    const fourthResponse = await handleHintRequest({
      deps,
      studentId,
      input: { requestId: "req-4", problemId: GOLDEN_PROBLEM.problemId, action: "REQUEST_HELP" },
    });
    expect(fourthResponse.kind).toBe("RESOLVED");
    expect(fourthResponse.currentLevel).toBe(thirdResponse.currentLevel); // did not advance further

    // --- Idempotency sanity: replaying req-3 returns the cached result, not a new one ---
    const replay = await handleHintRequest({
      deps,
      studentId,
      input: { requestId: "req-3", problemId: GOLDEN_PROBLEM.problemId, action: "REQUEST_HELP" },
    });
    expect(replay).toEqual(thirdResponse);
  });

  it("stops immediately without extra hints when a single direction hint is enough (no over-escalation)", async () => {
    const studentId = "student-golden-2";
    adapter.setSubmission(GOLDEN_SUBMISSION_1, GOLDEN_EXECUTION_1);

    const hintResponse = await handleHintRequest({
      deps,
      studentId,
      input: { requestId: "req-a", problemId: GOLDEN_PROBLEM.problemId, action: "REQUEST_HELP" },
    });
    expect(hintResponse.currentLevel).toBe("DIRECTION");

    // Student fixes it immediately and submits — accepted right away.
    adapter.setSubmission(GOLDEN_SUBMISSION_3, GOLDEN_EXECUTION_3);
    const resolvedResponse = await handleHintRequest({
      deps,
      studentId,
      input: { requestId: "req-b", problemId: GOLDEN_PROBLEM.problemId, action: "REQUEST_HELP" },
    });
    expect(resolvedResponse.kind).toBe("RESOLVED");
    expect(resolvedResponse.currentLevel).toBe("DIRECTION"); // resolved at the level it was solved, never escalated past it
  });
});
