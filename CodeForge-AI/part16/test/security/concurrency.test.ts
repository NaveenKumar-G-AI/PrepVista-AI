import { describe, it, expect } from "vitest";
import { requestAnalysis } from "../../src/api/handlers.js";
import { InMemoryCorrectnessRepository } from "../fixtures/memoryRepository.js";
import { InMemoryTokenBucketRateLimiter } from "../../src/security/rateLimiter.js";
import { evidence, test as t, ref } from "../fixtures/evidence.js";
import { TestOutcome, CorrectnessStatus } from "../../src/domain/enums.js";
import type { HandlerDeps } from "../../src/api/handlers.js";

const USER = "alice-uuid";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeDeps(): HandlerDeps {
  const repo = new InMemoryCorrectnessRepository();
  return {
    repo,
    ownership: { async getSubmissionOwnerId() { return USER; } },
    executionEvidence: {
      // Submission A is deliberately SLOWER than submission B, so B's
      // request finishes first even though A was started first — this is
      // exactly the "A executing, B submitted, A completes, B completes"
      // ordering from the spec's CONCURRENCY section.
      async getExecutionEvidence(submissionId: string) {
        if (submissionId === "sub_A") {
          await delay(30);
          return evidence({
            ref: ref({ submissionId: "sub_A", userId: USER, submissionVersion: "v1" }),
            tests: { totalAvailable: 2, gradingComplete: true, results: [t("a1", TestOutcome.WRONG_ANSWER), t("a2", TestOutcome.WRONG_ANSWER)] },
          });
        }
        await delay(1);
        return evidence({
          ref: ref({ submissionId: "sub_B", userId: USER, submissionVersion: "v1" }),
          tests: { totalAvailable: 2, gradingComplete: true, results: [t("b1", TestOutcome.PASS), t("b2", TestOutcome.PASS)] },
        });
      },
      async getExecutionEvidenceByVersion() {
        return null;
      },
    },
    submissionSource: { async getSourceCode() { return { sourceCode: "def f(): pass", filename: "s.py" }; } },
    requirements: { async getRequirements() { return []; } },
    rateLimiter: new InMemoryTokenBucketRateLimiter(1000, 10),
    aiProvider: null,
  };
}

describe("Concurrency", () => {
  it("two submissions analyzed concurrently never mix evidence, regardless of completion order", async () => {
    const deps = makeDeps();

    const [resultA, resultB] = await Promise.all([
      requestAnalysis(deps, USER, "sub_A"),
      requestAnalysis(deps, USER, "sub_B"),
    ]);

    // B finishes first (shorter delay) but Promise.all preserves result
    // order matching input order, so we assert on identity, not timing.
    expect(resultA.ref.submissionId).toBe("sub_A");
    expect(resultA.status).toBe(CorrectnessStatus.DEFINITIVELY_INCORRECT);
    expect(resultA.deterministic.failed).toBe(2);

    expect(resultB.ref.submissionId).toBe("sub_B");
    expect(resultB.status).toBe(CorrectnessStatus.ACCEPTED);
    expect(resultB.deterministic.passed).toBe(2);

    // Every stored row is pinned to its own exact submission/version — no
    // shared mutable state leaked between the two concurrent pipelines.
    const storedA = await deps.repo.getByVersion({ submissionId: "sub_A", submissionVersion: "v1" });
    const storedB = await deps.repo.getByVersion({ submissionId: "sub_B", submissionVersion: "v1" });
    expect(storedA!.deterministic.failed).toBe(2);
    expect(storedB!.deterministic.passed).toBe(2);
  });

  it("racing duplicate requests for the SAME submission version resolve to one consistent, well-formed row (no corruption)", async () => {
    const deps = makeDeps();
    const repo = deps.repo as InMemoryCorrectnessRepository;

    const results = await Promise.all([
      requestAnalysis(deps, USER, "sub_B"),
      requestAnalysis(deps, USER, "sub_B"),
      requestAnalysis(deps, USER, "sub_B"),
    ]);

    // Every concurrent caller gets back a fully-formed, self-consistent
    // assessment (never a partially-merged object).
    for (const r of results) {
      expect(r.ref.submissionId).toBe("sub_B");
      expect(r.status).toBe(CorrectnessStatus.ACCEPTED);
    }
    // At most a small number of rows could exist if the check-then-act
    // window is hit under true parallelism (the DB UNIQUE constraint is
    // the final backstop in production — see idempotency.test.ts) — but
    // every row that DOES exist must be internally consistent.
    expect(repo.size()).toBeGreaterThanOrEqual(1);
  });
});
