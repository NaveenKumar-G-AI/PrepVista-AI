import { describe, expect, it } from "vitest";
import {
  InMemoryExecutionResultRepository,
  DuplicateFinalizationError,
  UnauthorizedResultAccessError,
  ResultNotFoundError,
} from "../src/persistence/repository.js";
import { normalizeExecutionEvidence } from "../src/normalization/normalize.js";
import { finalizeResult } from "../src/finalize/finalizeResult.js";
import { baseRawEvidence } from "./fixtures.js";
import type { FinalizedExecutionResult } from "../src/types/normalized.js";

function finalizedFixture(overrides: Parameters<typeof baseRawEvidence>[0] = {}): FinalizedExecutionResult {
  const norm = normalizeExecutionEvidence(baseRawEvidence(overrides));
  if (!norm.ok) throw new Error("bad fixture");
  const fin = finalizeResult(norm.result);
  if (fin.kind !== "FINALIZED") throw new Error("fixture did not finalize");
  return fin;
}

describe("InMemoryExecutionResultRepository", () => {
  it("student A cannot read student B's result (IDOR-safe: authorization derived from ctx, not request)", async () => {
    const repo = new InMemoryExecutionResultRepository();
    const finalized = finalizedFixture({ submissionId: "sub_owned_by_A", evaluationId: "eval_A" });
    await repo.insertFinalizedResult(finalized, "user_A", "cohort_1");

    // Student B attempts to read student A's submission by guessing/changing the submissionId.
    await expect(
      repo.getResultForSubmission("sub_owned_by_A", { userId: "user_B", role: "STUDENT" }),
    ).rejects.toBeInstanceOf(UnauthorizedResultAccessError);
  });

  it("the owning student can read their own result", async () => {
    const repo = new InMemoryExecutionResultRepository();
    const finalized = finalizedFixture({ submissionId: "sub_owned_by_A", evaluationId: "eval_A" });
    await repo.insertFinalizedResult(finalized, "user_A", "cohort_1");

    const row = await repo.getResultForSubmission("sub_owned_by_A", { userId: "user_A", role: "STUDENT" });
    expect(row.result.evaluationId).toBe("eval_A");
  });

  it("an instructor without cohort authorization cannot read the result", async () => {
    const repo = new InMemoryExecutionResultRepository();
    const finalized = finalizedFixture({ submissionId: "sub_1", evaluationId: "eval_1" });
    await repo.insertFinalizedResult(finalized, "user_A", "cohort_1");

    await expect(
      repo.getResultForSubmission("sub_1", {
        userId: "instructor_x",
        role: "INSTRUCTOR",
        authorizedCohortIds: ["cohort_9"],
      }),
    ).rejects.toBeInstanceOf(UnauthorizedResultAccessError);
  });

  it("an instructor authorized for the cohort can read the result", async () => {
    const repo = new InMemoryExecutionResultRepository();
    const finalized = finalizedFixture({ submissionId: "sub_1", evaluationId: "eval_1" });
    await repo.insertFinalizedResult(finalized, "user_A", "cohort_1");

    const row = await repo.getResultForSubmission("sub_1", {
      userId: "instructor_x",
      role: "INSTRUCTOR",
      authorizedCohortIds: ["cohort_1"],
    });
    expect(row.result.evaluationId).toBe("eval_1");
  });

  it("an administrator can read any result regardless of ownership/cohort", async () => {
    const repo = new InMemoryExecutionResultRepository();
    const finalized = finalizedFixture({ submissionId: "sub_1", evaluationId: "eval_1" });
    await repo.insertFinalizedResult(finalized, "user_A", "cohort_1");

    const row = await repo.getResultForSubmission("sub_1", { userId: "admin_x", role: "ADMINISTRATOR" });
    expect(row.result.evaluationId).toBe("eval_1");
  });

  it("rejects a duplicate finalized insert for the same evaluationId (immutability at the persistence boundary)", async () => {
    const repo = new InMemoryExecutionResultRepository();
    const finalized = finalizedFixture({ submissionId: "sub_1", evaluationId: "eval_dup" });
    await repo.insertFinalizedResult(finalized, "user_A", "cohort_1");

    await expect(repo.insertFinalizedResult(finalized, "user_A", "cohort_1")).rejects.toBeInstanceOf(
      DuplicateFinalizationError,
    );
  });

  it("simulates two workers racing to finalize the same evaluation: only one write wins, no corruption", async () => {
    const repo = new InMemoryExecutionResultRepository();
    const finalized = finalizedFixture({ submissionId: "sub_race", evaluationId: "eval_race" });

    const results = await Promise.allSettled([
      repo.insertFinalizedResult(finalized, "user_A", "cohort_1"),
      repo.insertFinalizedResult(finalized, "user_A", "cohort_1"),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    const row = await repo.getResultForSubmission("sub_race", { userId: "user_A", role: "STUDENT" });
    expect(row.result.evaluationId).toBe("eval_race");
  });

  it("returns ResultNotFoundError for a nonexistent submission, not a leaked internal error", async () => {
    const repo = new InMemoryExecutionResultRepository();
    await expect(
      repo.getResultForSubmission("does_not_exist", { userId: "user_A", role: "STUDENT" }),
    ).rejects.toBeInstanceOf(ResultNotFoundError);
  });
});
