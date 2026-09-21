import { beforeEach, describe, expect, it } from "vitest";
import { getHintLadderHistory, getHintLadderState, handleHintRequest, HintLadderServiceDeps } from "@/lib/hint-ladder/service";
import { InMemoryHintLadderRepository } from "@/lib/hint-ladder/repository/in-memory-repository";
import { InMemorySlidingWindowRateLimiter } from "@/lib/hint-ladder/rate-limit";
import { ProviderRouter } from "@/lib/hint-ladder/providers/router";
import { FakeProvider, fixedJsonResponder } from "@/lib/hint-ladder/providers/fake-provider";
import { DEFAULT_MODE_POLICY_LIMITS } from "@/lib/hint-ladder/policy-engine";
import { DemoExistingSystemsAdapter } from "@/lib/stand-ins/existing-systems-adapter";
import { AuthError, OwnershipError, RateLimitError } from "@/lib/hint-ladder/errors";

const validModelJson = {
  assistance_level: "DIRECTION",
  hint_type: "DIRECTION",
  concept: "BOUNDARY_CONDITION",
  observation: "6/10 tests passed.",
  hint: "Look closely at how your loop handles the final valid element.",
  target_area: "solve() loop",
  confidence: "MEDIUM",
  teaching_objective: "Understand the valid index range.",
  next_action: "await_student_response",
  solution_revealed: false,
};

function buildDeps(): HintLadderServiceDeps {
  const adapter = new DemoExistingSystemsAdapter();
  adapter.recordSubmission(
    "student-a",
    "demo-sum-array",
    { submissionId: "s1", code: "def solve(nums):\n    return sum(nums)", language: "python", createdAt: new Date().toISOString() },
    { submissionId: "s1", verdict: "WRONG_ANSWER", testsPassed: 6, testsTotal: 10, compilerError: null, runtimeError: null, stackTrace: null, failingPublicCases: null, createdAt: new Date().toISOString() }
  );
  return {
    repository: new InMemoryHintLadderRepository(),
    existingSystems: adapter,
    router: new ProviderRouter({ groq: new FakeProvider(fixedJsonResponder(validModelJson)) }, { primary: "groq", timeoutMs: 5000 }),
    rateLimiter: new InMemorySlidingWindowRateLimiter(10_000, 1000),
    modeLimits: DEFAULT_MODE_POLICY_LIMITS,
    now: () => new Date().toISOString(),
  };
}

describe("Authorization / IDOR protection", () => {
  let deps: HintLadderServiceDeps;

  beforeEach(() => {
    deps = buildDeps();
  });

  it("rejects an unauthenticated request outright", async () => {
    await expect(
      handleHintRequest({ deps, studentId: null, input: { requestId: "r1", problemId: "demo-sum-array", action: "REQUEST_HELP" } })
    ).rejects.toBeInstanceOf(AuthError);
  });

  it("creates separate, isolated sessions per student for the same problem", async () => {
    const a = await handleHintRequest({ deps, studentId: "student-a", input: { requestId: "r1", problemId: "demo-sum-array", action: "REQUEST_HELP" } });

    deps.existingSystems = (() => {
      const adapter = new DemoExistingSystemsAdapter();
      adapter.recordSubmission(
        "student-b",
        "demo-sum-array",
        { submissionId: "s2", code: "def solve(nums):\n    return 0", language: "python", createdAt: new Date().toISOString() },
        { submissionId: "s2", verdict: "WRONG_ANSWER", testsPassed: 2, testsTotal: 10, compilerError: null, runtimeError: null, stackTrace: null, failingPublicCases: null, createdAt: new Date().toISOString() }
      );
      return adapter;
    })();
    const b = await handleHintRequest({ deps, studentId: "student-b", input: { requestId: "r2", problemId: "demo-sum-array", action: "REQUEST_HELP" } });

    expect(a.sessionId).not.toBe(b.sessionId);
  });

  it("student B cannot read student A's hint state through getHintLadderState", async () => {
    await handleHintRequest({ deps, studentId: "student-a", input: { requestId: "r1", problemId: "demo-sum-array", action: "REQUEST_HELP" } });

    // getHintLadderState scopes its own lookup by the requesting studentId,
    // so "student-b" querying the same problemId simply finds no session
    // of their own — student A's session is never reachable via student B's id.
    const bState = await getHintLadderState(deps, "student-b", "demo-sum-array");
    expect(bState.exists).toBe(false);

    const aState = await getHintLadderState(deps, "student-a", "demo-sum-array");
    expect(aState.exists).toBe(true);
  });

  it("student B's hint history is empty, never leaking student A's history", async () => {
    await handleHintRequest({ deps, studentId: "student-a", input: { requestId: "r1", problemId: "demo-sum-array", action: "REQUEST_HELP" } });
    const bHistory = await getHintLadderHistory(deps, "student-b", "demo-sum-array");
    expect(bHistory).toEqual([]);
  });

  it("getHintLadderState/History reject unauthenticated calls", async () => {
    await expect(getHintLadderState(deps, null, "demo-sum-array")).rejects.toBeInstanceOf(AuthError);
    await expect(getHintLadderHistory(deps, null, "demo-sum-array")).rejects.toBeInstanceOf(AuthError);
  });
});

describe("Rate limiting", () => {
  it("throws RateLimitError once the configured window is exceeded", async () => {
    const adapter = new DemoExistingSystemsAdapter();
    adapter.recordSubmission(
      "student-c",
      "demo-sum-array",
      { submissionId: "s1", code: "def solve(nums):\n    return sum(nums)", language: "python", createdAt: new Date().toISOString() },
      { submissionId: "s1", verdict: "WRONG_ANSWER", testsPassed: 6, testsTotal: 10, compilerError: null, runtimeError: null, stackTrace: null, failingPublicCases: null, createdAt: new Date().toISOString() }
    );
    const deps: HintLadderServiceDeps = {
      repository: new InMemoryHintLadderRepository(),
      existingSystems: adapter,
      router: new ProviderRouter({ groq: new FakeProvider(fixedJsonResponder(validModelJson)) }, { primary: "groq", timeoutMs: 5000 }),
      rateLimiter: new InMemorySlidingWindowRateLimiter(10_000, 2), // only 2 requests per 10s window
      modeLimits: DEFAULT_MODE_POLICY_LIMITS,
      now: () => new Date().toISOString(),
    };

    await handleHintRequest({ deps, studentId: "student-c", input: { requestId: "r1", problemId: "demo-sum-array", action: "REQUEST_HELP" } });
    await handleHintRequest({ deps, studentId: "student-c", input: { requestId: "r2", problemId: "demo-sum-array", action: "REQUEST_DEEPER" } });

    await expect(
      handleHintRequest({ deps, studentId: "student-c", input: { requestId: "r3", problemId: "demo-sum-array", action: "REQUEST_DEEPER" } })
    ).rejects.toBeInstanceOf(RateLimitError);
  });
});
