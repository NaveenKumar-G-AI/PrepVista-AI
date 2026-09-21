import { describe, it, expect } from "vitest";
import { requestAnalysis, getCorrectnessAssessment, getCorrectnessHistory } from "../../src/api/handlers.js";
import { AuthorizationError } from "../../src/security/authorization.js";
import { InMemoryCorrectnessRepository } from "../fixtures/memoryRepository.js";
import { InMemoryTokenBucketRateLimiter } from "../../src/security/rateLimiter.js";
import { evidence, test as t, ref } from "../fixtures/evidence.js";
import { TestOutcome } from "../../src/domain/enums.js";
import type { HandlerDeps } from "../../src/api/handlers.js";

const ALICE = "alice-uuid";
const BOB = "bob-uuid";

function makeDeps(overrides: Partial<HandlerDeps> = {}): HandlerDeps {
  const repo = new InMemoryCorrectnessRepository();
  return {
    repo,
    ownership: {
      // The single source of truth for "who owns submission X" — mirrors
      // a lookup against the host app's real submissions table.
      async getSubmissionOwnerId(submissionId: string) {
        if (submissionId === "alice_sub") return ALICE;
        if (submissionId === "bob_sub") return BOB;
        return null;
      },
    },
    executionEvidence: {
      async getExecutionEvidence(submissionId: string) {
        const owner = submissionId === "alice_sub" ? ALICE : BOB;
        return evidence({
          ref: ref({ submissionId, userId: owner, submissionVersion: "v1" }),
          tests: { totalAvailable: 2, gradingComplete: true, results: [t("t1", TestOutcome.PASS), t("t2", TestOutcome.WRONG_ANSWER)] },
        });
      },
      async getExecutionEvidenceByVersion() {
        return null;
      },
    },
    submissionSource: {
      async getSourceCode() {
        return { sourceCode: "def f(x): return x", filename: "submission.py" };
      },
    },
    requirements: { async getRequirements() { return []; } },
    rateLimiter: new InMemoryTokenBucketRateLimiter(100, 1),
    aiProvider: null,
    ...overrides,
  };
}

describe("Authorization", () => {
  it("a user CAN request analysis of their own submission", async () => {
    const deps = makeDeps();
    const assessment = await requestAnalysis(deps, ALICE, "alice_sub");
    expect(assessment.ref.userId).toBe(ALICE);
  });

  it("a user CANNOT request analysis of another user's submission", async () => {
    const deps = makeDeps();
    await expect(requestAnalysis(deps, ALICE, "bob_sub")).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("a user CANNOT read another user's correctness assessment", async () => {
    const deps = makeDeps();
    await requestAnalysis(deps, BOB, "bob_sub"); // Bob's assessment now exists
    await expect(getCorrectnessAssessment(deps, ALICE, "bob_sub", "v1")).rejects.toBeInstanceOf(AuthorizationError);
    // Bob himself can still read it:
    const bobsView = await getCorrectnessAssessment(deps, BOB, "bob_sub", "v1");
    expect(bobsView.ref.userId).toBe(BOB);
  });

  it("requesting analysis of a nonexistent submission fails the SAME way as an unowned one (no existence leak)", async () => {
    const deps = makeDeps();
    await expect(requestAnalysis(deps, ALICE, "does_not_exist")).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("history is always scoped to the requester's own userId — there is no parameter to pass someone else's", async () => {
    const deps = makeDeps();
    await requestAnalysis(deps, ALICE, "alice_sub");
    await requestAnalysis(deps, BOB, "bob_sub");
    const aliceHistory = await getCorrectnessHistory(deps, ALICE, "problem_two_sum");
    expect(aliceHistory).toHaveLength(1);
    expect(aliceHistory[0]!.ref.userId).toBe(ALICE);
  });

  it("defense in depth: even if ownership lookup and evidence disagree, the request is refused", async () => {
    // Simulates a buggy adapter that returns evidence for the wrong user
    // despite the ownership table saying Alice owns it.
    const deps = makeDeps({
      executionEvidence: {
        async getExecutionEvidence(submissionId: string) {
          return evidence({
            ref: ref({ submissionId, userId: BOB, submissionVersion: "v1" }), // mismatched on purpose
            tests: { totalAvailable: 1, gradingComplete: true, results: [t("t1", TestOutcome.PASS)] },
          });
        },
      },
    });
    await expect(requestAnalysis(deps, ALICE, "alice_sub")).rejects.toBeInstanceOf(AuthorizationError);
  });
});
