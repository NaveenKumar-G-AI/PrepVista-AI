import { describe, it, expect } from "vitest";
import { requestAnalysis } from "../../src/api/handlers.js";
import { InMemoryCorrectnessRepository } from "../fixtures/memoryRepository.js";
import { InMemoryTokenBucketRateLimiter } from "../../src/security/rateLimiter.js";
import { evidence, test as t, ref } from "../fixtures/evidence.js";
import { TestOutcome } from "../../src/domain/enums.js";
import type { HandlerDeps } from "../../src/api/handlers.js";

const USER = "alice-uuid";

function makeDeps(): HandlerDeps {
  const repo = new InMemoryCorrectnessRepository();
  let fetchCount = 0;
  return {
    repo,
    ownership: { async getSubmissionOwnerId() { return USER; } },
    executionEvidence: {
      async getExecutionEvidence(submissionId: string) {
        fetchCount += 1;
        return evidence({
          ref: ref({ submissionId, userId: USER, submissionVersion: "v1" }),
          tests: { totalAvailable: 3, gradingComplete: true, results: [t("t1", TestOutcome.PASS), t("t2", TestOutcome.WRONG_ANSWER)] },
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

describe("Idempotency", () => {
  it("analyzing the same submission version twice returns the SAME assessment id, not a duplicate", async () => {
    const deps = makeDeps();
    const first = await requestAnalysis(deps, USER, "sub_1");
    const second = await requestAnalysis(deps, USER, "sub_1");
    expect(second.id).toBe(first.id);
    expect((deps.repo as InMemoryCorrectnessRepository).size()).toBe(1);
  });

  it("the underlying repository is only written to ONCE across repeated identical requests (short-circuits on existing version)", async () => {
    const deps = makeDeps();
    const repo = deps.repo as InMemoryCorrectnessRepository;
    await requestAnalysis(deps, USER, "sub_1");
    await requestAnalysis(deps, USER, "sub_1");
    await requestAnalysis(deps, USER, "sub_1");
    expect(repo.saveCallCount).toBe(1);
  });

  it("the database-level UNIQUE(submission_id, submission_version) constraint backstops this even if application logic changes", async () => {
    // This is a documentation-style assertion: the real guarantee lives in
    // 0001_correctness_assessments.sql as a UNIQUE constraint + upsert
    // (ON CONFLICT) in supabaseRepository.ts, so a second writer racing
    // past the in-app existence check still cannot create a duplicate row
    // — see the CONCURRENCY test for the race itself.
    const fs = await import("node:fs");
    const migration = fs.readFileSync(
      new URL("../../src/persistence/migrations/0001_correctness_assessments.sql", import.meta.url),
      "utf-8"
    );
    expect(migration).toMatch(/UNIQUE\s*\(submission_id,\s*submission_version\)/);
  });
});
