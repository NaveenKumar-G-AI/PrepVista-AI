import { describe, it, expect } from "vitest";
import { compareAttempts } from "../engine/attemptComparison";

describe("attemptComparison", () => {
  it("recognizes improvement from 5/10 to 8/10", () => {
    const result = compareAttempts([
      { submissionId: "a", submittedAt: "t1", verdict: "WRONG_ANSWER", testsPassed: 5, testsTotal: 10 },
      { submissionId: "b", submittedAt: "t2", verdict: "WRONG_ANSWER", testsPassed: 8, testsTotal: 10 },
    ]);
    expect(result.improved).toBe(true);
    expect(result.summary).toContain("5/10 to 8/10");
  });

  it("recognizes a regression", () => {
    const result = compareAttempts([
      { submissionId: "a", submittedAt: "t1", verdict: "WRONG_ANSWER", testsPassed: 8, testsTotal: 10 },
      { submissionId: "b", submittedAt: "t2", verdict: "WRONG_ANSWER", testsPassed: 6, testsTotal: 10 },
    ]);
    expect(result.regressed).toBe(true);
  });

  it("does not claim a comparison with fewer than two scored submissions", () => {
    const result = compareAttempts([{ submissionId: "a", submittedAt: "t1", verdict: "WRONG_ANSWER" }]);
    expect(result.hasComparison).toBe(false);
  });
});
