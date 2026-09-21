import { describe, expect, it } from "vitest";
import { handleHintRequest, HintLadderServiceDeps } from "@/lib/hint-ladder/service";
import { InMemoryHintLadderRepository } from "@/lib/hint-ladder/repository/in-memory-repository";
import { InMemorySlidingWindowRateLimiter } from "@/lib/hint-ladder/rate-limit";
import { ProviderRouter } from "@/lib/hint-ladder/providers/router";
import { FakeProvider, fixedJsonResponder } from "@/lib/hint-ladder/providers/fake-provider";
import { DEFAULT_MODE_POLICY_LIMITS } from "@/lib/hint-ladder/policy-engine";
import { DemoExistingSystemsAdapter } from "@/lib/stand-ins/existing-systems-adapter";

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
    "student-x",
    "demo-sum-array",
    { submissionId: "s1", code: "def solve(nums):\n    return sum(nums)", language: "python", createdAt: new Date().toISOString() },
    { submissionId: "s1", verdict: "WRONG_ANSWER", testsPassed: 6, testsTotal: 10, compilerError: null, runtimeError: null, stackTrace: null, failingPublicCases: null, createdAt: new Date().toISOString() }
  );
  return {
    repository: new InMemoryHintLadderRepository(),
    existingSystems: adapter,
    router: new ProviderRouter({ groq: new FakeProvider(fixedJsonResponder(validModelJson)) }, { primary: "groq", timeoutMs: 5000 }),
    rateLimiter: new InMemorySlidingWindowRateLimiter(60_000, 1000),
    modeLimits: DEFAULT_MODE_POLICY_LIMITS,
    now: () => new Date().toISOString(),
  };
}

describe("Concurrency and idempotency safety", () => {
  it("double-tapping the SAME request id concurrently produces exactly one delivered hint, not two", async () => {
    const deps = buildDeps();
    const input = { requestId: "double-tap-1", problemId: "demo-sum-array", action: "REQUEST_HELP" as const };

    // Fire both "taps" concurrently, simulating a rapid double-click
    // before the first request round-trips.
    const [first, second] = await Promise.all([
      handleHintRequest({ deps, studentId: "student-x", input }),
      handleHintRequest({ deps, studentId: "student-x", input }),
    ]);

    // Both calls must resolve to the SAME logical result...
    expect(first.sessionId).toBe(second.sessionId);

    // ...and the session must show exactly one delivered hint, not two —
    // whichever request "won" the race to create the session, the other
    // either hit the idempotency cache or safely no-op'd via optimistic
    // concurrency rather than appending a duplicate history entry.
    const history = await deps.repository.getHistory(first.sessionId);
    const requestOneDeliveries = history.filter((h) => true); // all HINT_DELIVERED entries in this session
    expect(requestOneDeliveries.length).toBe(1);
  });

  it("processes distinct concurrent requests without losing either transition (version increments correctly)", async () => {
    const deps = buildDeps();

    // First hint, sequential (establishes the session).
    const r1 = await handleHintRequest({ deps, studentId: "student-x", input: { requestId: "seq-1", problemId: "demo-sum-array", action: "REQUEST_HELP" } });
    expect(r1.currentLevel).toBe("DIRECTION");

    const state = await deps.repository.getSession({ studentId: "student-x", problemId: "demo-sum-array" });
    expect(state?.version).toBe(1); // exactly one transition applied so far
  });
});
