import { describe, expect, it } from "vitest";
import { ingestEvaluationEvent } from "../src/api/ingestEvaluationEvent.js";
import { InMemoryExecutionResultRepository } from "../src/persistence/repository.js";
import type { EvaluationTrackedState } from "../src/state/eventGuard.js";
import { baseRawEvidence, test } from "./fixtures.js";
import type { LifecycleEvent } from "../src/types/normalized.js";

function makeStateStore() {
  const store = new Map<string, EvaluationTrackedState>();
  return {
    lookup: async (id: string) => store.get(id) ?? null,
    save: async (s: EvaluationTrackedState) => {
      store.set(s.evaluationId, s);
    },
  };
}

function lifecycle(state: LifecycleEvent["state"], seq: number, evaluationId = "eval_e2e"): LifecycleEvent {
  return { submissionId: "sub_e2e", evaluationId, state, sequence: seq, emittedAtIso: new Date().toISOString() };
}

describe("ingestEvaluationEvent — end to end", () => {
  it("correct submission: SUBMITTED -> QUEUED -> RUNNING -> COMPLETED yields ACCEPTED", async () => {
    const repo = new InMemoryExecutionResultRepository();
    const store = makeStateStore();

    for (const [state, seq] of [["SUBMITTED", 1], ["QUEUED", 2], ["RUNNING", 3]] as const) {
      const r = await ingestEvaluationEvent(
        { lifecycleEvent: lifecycle(state, seq), rawEvidence: null, ownerUserId: "user_A", cohortId: "cohort_1" },
        repo,
        store.lookup,
        store.save,
      );
      expect(r.kind).toBe("LIFECYCLE_UPDATED");
    }

    const completion = await ingestEvaluationEvent(
      {
        lifecycleEvent: lifecycle("COMPLETED", 4),
        rawEvidence: baseRawEvidence({ submissionId: "sub_e2e", evaluationId: "eval_e2e" }),
        ownerUserId: "user_A",
        cohortId: "cohort_1",
      },
      repo,
      store.lookup,
      store.save,
    );
    expect(completion).toEqual({ kind: "FINALIZED", verdict: "ACCEPTED" });

    const stored = await repo.getResultForSubmission("sub_e2e", { userId: "user_A", role: "STUDENT" });
    expect(stored.result.verdict).toBe("ACCEPTED");
  });

  it("wrong solution: failing test evidence yields a persisted WRONG_ANSWER result", async () => {
    const repo = new InMemoryExecutionResultRepository();
    const store = makeStateStore();
    const raw = baseRawEvidence({
      submissionId: "sub_wa",
      evaluationId: "eval_wa",
      tests: [test("t1", "PUBLIC", 0, "FAILED", "WRONG_OUTPUT")],
      scoring: { strategy: "PASS_COUNT", score: 0, maxScore: 1, groups: null },
    });
    const r = await ingestEvaluationEvent(
      { lifecycleEvent: lifecycle("COMPLETED", 1, "eval_wa"), rawEvidence: raw, ownerUserId: "user_A", cohortId: null },
      repo,
      store.lookup,
      store.save,
    );
    expect(r).toEqual({ kind: "FINALIZED", verdict: "WRONG_ANSWER" });
  });

  it("compilation failure: yields a persisted COMPILATION_ERROR result", async () => {
    const repo = new InMemoryExecutionResultRepository();
    const store = makeStateStore();
    const raw = baseRawEvidence({
      submissionId: "sub_ce",
      evaluationId: "eval_ce",
      tests: [],
      compilation: {
        status: "FAILED",
        durationMs: 80,
        error: { compiler: "javac", line: 4, column: 1, message: "cannot find symbol", category: "syntax" },
      },
    });
    const r = await ingestEvaluationEvent(
      { lifecycleEvent: lifecycle("COMPLETED", 1, "eval_ce"), rawEvidence: raw, ownerUserId: "user_A", cohortId: null },
      repo,
      store.lookup,
      store.save,
    );
    expect(r).toEqual({ kind: "FINALIZED", verdict: "COMPILATION_ERROR" });
  });

  it("evaluator failure: yields JUDGE_ERROR, never a fabricated WRONG_ANSWER", async () => {
    const repo = new InMemoryExecutionResultRepository();
    const store = makeStateStore();
    const raw = baseRawEvidence({
      submissionId: "sub_judge",
      evaluationId: "eval_judge",
      infrastructure: {
        evaluatorCrashed: true,
        malformedEvaluatorResponse: false,
        sandboxInfrastructureFailure: false,
        databaseFailureDuringEvaluation: false,
        workerCrashed: false,
        queueRetryExhausted: false,
        networkInterruption: false,
      },
    });
    const r = await ingestEvaluationEvent(
      { lifecycleEvent: lifecycle("COMPLETED", 1, "eval_judge"), rawEvidence: raw, ownerUserId: "user_A", cohortId: null },
      repo,
      store.lookup,
      store.save,
    );
    expect(r).toEqual({ kind: "FINALIZED", verdict: "JUDGE_ERROR" });
  });

  it("malformed evaluator payload is rejected safely, never crashes the pipeline", async () => {
    const repo = new InMemoryExecutionResultRepository();
    const store = makeStateStore();
    const r = await ingestEvaluationEvent(
      {
        lifecycleEvent: lifecycle("COMPLETED", 1, "eval_malformed"),
        rawEvidence: { garbage: true },
        ownerUserId: "user_A",
        cohortId: null,
      },
      repo,
      store.lookup,
      store.save,
    );
    expect(r.kind).toBe("NORMALIZATION_REJECTED");
  });

  it("incomplete evaluation reaching COMPLETED lifecycle is never finalized as a normal result", async () => {
    const repo = new InMemoryExecutionResultRepository();
    const store = makeStateStore();
    const raw = baseRawEvidence({
      submissionId: "sub_incomplete",
      evaluationId: "eval_incomplete",
      requiredEvaluationCount: 10,
      completedEvaluationCount: 6,
    });
    const r = await ingestEvaluationEvent(
      { lifecycleEvent: lifecycle("COMPLETED", 1, "eval_incomplete"), rawEvidence: raw, ownerUserId: "user_A", cohortId: null },
      repo,
      store.lookup,
      store.save,
    );
    expect(r.kind).toBe("NOT_FINALIZED");
    await expect(
      repo.getResultForSubmission("sub_incomplete", { userId: "user_A", role: "STUDENT" }),
    ).rejects.toThrow();
  });

  it("duplicate COMPLETED events (same evaluationId) do not double-finalize or throw", async () => {
    const repo = new InMemoryExecutionResultRepository();
    const store = makeStateStore();
    const raw = baseRawEvidence({ submissionId: "sub_dup", evaluationId: "eval_dup2" });

    const first = await ingestEvaluationEvent(
      { lifecycleEvent: lifecycle("COMPLETED", 1, "eval_dup2"), rawEvidence: raw, ownerUserId: "user_A", cohortId: null },
      repo,
      store.lookup,
      store.save,
    );
    expect(first.kind).toBe("FINALIZED");

    const second = await ingestEvaluationEvent(
      { lifecycleEvent: lifecycle("COMPLETED", 1, "eval_dup2"), rawEvidence: raw, ownerUserId: "user_A", cohortId: null },
      repo,
      store.lookup,
      store.save,
    );
    // Second delivery of the identical event is caught by the lifecycle
    // guard (exact duplicate) before it ever reaches persistence again.
    expect(second.kind).toBe("IGNORED_STALE_OR_DUPLICATE");
  });
});
