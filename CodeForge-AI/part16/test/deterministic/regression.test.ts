import { describe, it, expect } from "vitest";
import { computeDelta } from "../../src/deterministic/regression.js";
import { classify } from "../../src/deterministic/classify.js";
import { evidence, test as t } from "../fixtures/evidence.js";
import { TestOutcome } from "../../src/domain/enums.js";

function snapshot(passingIds: string[], failingIds: string[]) {
  const ev = evidence({
    tests: {
      totalAvailable: passingIds.length + failingIds.length,
      gradingComplete: true,
      results: [
        ...passingIds.map((id) => t(id, TestOutcome.PASS)),
        ...failingIds.map((id) => t(id, TestOutcome.WRONG_ANSWER)),
      ],
    },
  });
  return { verdict: classify(ev), evidence: ev };
}

describe("computeDelta()", () => {
  it("detects regression: 10/10 -> 7/10", () => {
    const previous = snapshot(
      ["t0", "t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9"],
      []
    );
    const current = snapshot(
      ["t0", "t1", "t2", "t3", "t4", "t5", "t6"],
      ["t7", "t8", "t9"]
    );
    const delta = computeDelta(previous, current);
    expect(delta.regression).toBe(true);
    expect(delta.improvement).toBe(false);
    expect(delta.newFailures.sort()).toEqual(["t7", "t8", "t9"]);
    expect(delta.resolvedFailures).toEqual([]);
  });

  it("detects improvement: 5/10 -> 8/10", () => {
    const previous = snapshot(["t0", "t1", "t2", "t3", "t4"], ["t5", "t6", "t7", "t8", "t9"]);
    const current = snapshot(["t0", "t1", "t2", "t3", "t4", "t5", "t6", "t7"], ["t8", "t9"]);
    const delta = computeDelta(previous, current);
    expect(delta.improvement).toBe(true);
    expect(delta.regression).toBe(false);
    expect(delta.resolvedFailures.sort()).toEqual(["t5", "t6", "t7"]);
  });

  it("first submission has no previous -> no regression/improvement claimed", () => {
    const current = snapshot(["t0"], ["t1"]);
    const delta = computeDelta(null, current);
    expect(delta.previousStatus).toBeNull();
    expect(delta.improvement).toBe(false);
    expect(delta.regression).toBe(false);
  });

  it("golden fixture: 6/10 -> 9/10 -> 10/10 progression", () => {
    const a = snapshot(["t0", "t1", "t2", "t3", "t4", "t5"], ["t6", "t7", "t8", "t9"]);
    const b = snapshot(["t0", "t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8"], ["t9"]);
    const c = snapshot(["t0", "t1", "t2", "t3", "t4", "t5", "t6", "t7", "t8", "t9"], []);

    const deltaAB = computeDelta(a, b);
    expect(deltaAB.improvement).toBe(true);
    expect(deltaAB.resolvedFailures.sort()).toEqual(["t6", "t7", "t8"]);

    const deltaBC = computeDelta(b, c);
    expect(deltaBC.improvement).toBe(true);
    expect(deltaBC.resolvedFailures).toEqual(["t9"]);
    expect(c.verdict.status).toBe("ACCEPTED");
  });
});
