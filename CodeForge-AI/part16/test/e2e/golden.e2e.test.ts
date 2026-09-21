import { describe, it, expect } from "vitest";
import { requestAnalysis } from "../../src/api/handlers.js";
import { InMemoryCorrectnessRepository } from "../fixtures/memoryRepository.js";
import { InMemoryTokenBucketRateLimiter } from "../../src/security/rateLimiter.js";
import { evidence, test as t, ref } from "../fixtures/evidence.js";
import { TestOutcome, CorrectnessStatus } from "../../src/domain/enums.js";
import type { HandlerDeps, ExecutionEvidence } from "../../src/api/handlers.js";
import type { Requirement } from "../../src/domain/types.js";

const USER = "student-uuid";
const PROBLEM = "problem_two_sum";

const boundaryRequirement: Requirement = {
  id: "req-boundary",
  description: "Handles boundary / small inputs correctly",
  category: "edge-case",
  relatedTags: ["boundary"],
};

/**
 * Deterministic, hand-authored fixture data for three submission versions
 * of the SAME problem, by the SAME student — never generated or invented
 * at runtime, exactly as the spec requires ("Do not generate fake
 * execution data in production" — this is a *test* fixture, the one place
 * the spec explicitly permits it).
 */
function evidenceFor(version: "v1" | "v2" | "v3"): ExecutionEvidence {
  if (version === "v1") {
    // Submission A: 6/10 pass. 4 boundary-tagged failures.
    return evidence({
      ref: ref({ submissionId: "sub_1", submissionVersion: "v1", userId: USER, problemId: PROBLEM }),
      tests: {
        totalAvailable: 10,
        gradingComplete: true,
        results: [
          ...Array.from({ length: 6 }, (_, i) => t(`n${i}`, TestOutcome.PASS, ["normal"])),
          t("b0", TestOutcome.WRONG_ANSWER, ["boundary"]),
          t("b1", TestOutcome.WRONG_ANSWER, ["boundary"]),
          t("b2", TestOutcome.WRONG_ANSWER, ["boundary"]),
          t("b3", TestOutcome.WRONG_ANSWER, ["boundary"]),
        ],
      },
    });
  }
  if (version === "v2") {
    // Submission B: student fixed 3 of the 4 boundary cases. 9/10 pass.
    return evidence({
      ref: ref({ submissionId: "sub_1", submissionVersion: "v2", userId: USER, problemId: PROBLEM }),
      tests: {
        totalAvailable: 10,
        gradingComplete: true,
        results: [
          ...Array.from({ length: 6 }, (_, i) => t(`n${i}`, TestOutcome.PASS, ["normal"])),
          t("b0", TestOutcome.PASS, ["boundary"]),
          t("b1", TestOutcome.PASS, ["boundary"]),
          t("b2", TestOutcome.PASS, ["boundary"]),
          t("b3", TestOutcome.WRONG_ANSWER, ["boundary"]),
        ],
      },
    });
  }
  // Submission C: 10/10 pass.
  return evidence({
    ref: ref({ submissionId: "sub_1", submissionVersion: "v3", userId: USER, problemId: PROBLEM }),
    tests: {
      totalAvailable: 10,
      gradingComplete: true,
      results: [
        ...Array.from({ length: 6 }, (_, i) => t(`n${i}`, TestOutcome.PASS, ["normal"])),
        t("b0", TestOutcome.PASS, ["boundary"]),
        t("b1", TestOutcome.PASS, ["boundary"]),
        t("b2", TestOutcome.PASS, ["boundary"]),
        t("b3", TestOutcome.PASS, ["boundary"]),
      ],
    },
  });
}

function makeDeps(): HandlerDeps {
  let currentVersion: "v1" | "v2" | "v3" = "v1";
  return {
    repo: new InMemoryCorrectnessRepository(),
    ownership: { async getSubmissionOwnerId() { return USER; } },
    executionEvidence: {
      async getExecutionEvidence() {
        return evidenceFor(currentVersion);
      },
      // Real behavior: the (simulated) execution engine can look up ANY
      // prior version's evidence by id, exactly like a real execution-
      // results table would. This is what makes delta/regression
      // detection correct — see the bug this caught, fixed in
      // src/api/handlers.ts.
      async getExecutionEvidenceByVersion(_submissionId: string, submissionVersion: string) {
        return evidenceFor(submissionVersion as "v1" | "v2" | "v3");
      },
    },
    submissionSource: {
      async getSourceCode() {
        return {
          sourceCode:
            currentVersion === "v1"
              ? "def two_sum(nums, target):\n    for i in range(1, len(nums)):\n        pass  # off-by-one: skips index 0\n"
              : "def two_sum(nums, target):\n    for i in range(len(nums)):\n        pass  # fixed\n",
          filename: "submission.py",
        };
      },
    },
    requirements: { async getRequirements() { return [boundaryRequirement]; } },
    rateLimiter: new InMemoryTokenBucketRateLimiter(1000, 10),
    aiProvider: null,
    // exposed for the test driver below to advance state between calls
    __setVersion: (v: "v1" | "v2" | "v3") => { currentVersion = v; },
  } as HandlerDeps & { __setVersion: (v: "v1" | "v2" | "v3") => void };
}

describe("GOLDEN END-TO-END: 6/10 -> 9/10 -> 10/10 progression", () => {
  it("tracks the full correctness journey exactly as specified", async () => {
    const deps = makeDeps() as HandlerDeps & { __setVersion: (v: "v1" | "v2" | "v3") => void };

    // --- Submission A: 6/10 ---
    deps.__setVersion("v1");
    const a = await requestAnalysis(deps, USER, "sub_1");
    expect(a.deterministic.passed).toBe(6);
    expect(a.deterministic.failed).toBe(4);
    expect(a.status).toBe(CorrectnessStatus.PARTIALLY_VALIDATED);
    const boundaryCluster = a.deterministic.clusters.find((c) => c.sharedTags.includes("boundary"));
    expect(boundaryCluster?.testIds.sort()).toEqual(["b0", "b1", "b2", "b3"]);
    expect(a.requirementCoverage.find((r) => r.requirement.id === "req-boundary")?.status).toBe("VIOLATED");
    expect(a.delta?.previousStatus).toBeNull(); // first submission

    // --- Submission B: 9/10, improvement ---
    deps.__setVersion("v2");
    const b = await requestAnalysis(deps, USER, "sub_1");
    expect(b.deterministic.passed).toBe(9);
    expect(b.deterministic.failed).toBe(1);
    expect(b.status).toBe(CorrectnessStatus.PARTIALLY_VALIDATED);
    expect(b.delta?.improvement).toBe(true);
    expect(b.delta?.regression).toBe(false);
    expect(b.delta?.resolvedFailures.sort()).toEqual(["b0", "b1", "b2"]);
    expect(b.delta?.previousStatus).toBe(CorrectnessStatus.PARTIALLY_VALIDATED);
    expect(b.delta?.previousPassRate).toBeCloseTo(0.6);
    expect(b.delta?.currentPassRate).toBeCloseTo(0.9);

    // --- Submission C: 10/10, fully validated ---
    deps.__setVersion("v3");
    const c = await requestAnalysis(deps, USER, "sub_1");
    expect(c.deterministic.passed).toBe(10);
    expect(c.deterministic.failed).toBe(0);
    expect(c.status).toBe(CorrectnessStatus.ACCEPTED);
    expect(c.delta?.improvement).toBe(true);
    expect(c.delta?.resolvedFailures).toEqual(["b3"]);
    expect(c.requirementCoverage.find((r) => r.requirement.id === "req-boundary")?.status).toBe("VALIDATED");

    // --- Full timeline available to the coaching layer, oldest evidence intact ---
    const history = await deps.repo.getHistory(PROBLEM, USER);
    expect(history).toHaveLength(3);
    expect(history.map((h) => h.deterministic.passed).sort((x, y) => x - y)).toEqual([6, 9, 10]);
  });
});
