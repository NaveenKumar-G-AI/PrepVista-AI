import { describe, it, expect } from "vitest";
import { classify } from "../../src/deterministic/classify.js";
import { CorrectnessStatus, ErrorCategory, TestOutcome, ConfidenceLevel } from "../../src/domain/enums.js";
import { evidence, test as t } from "../fixtures/evidence.js";

describe("classify() — deterministic evidence layer", () => {
  it("UNKNOWN when there is no execution evidence at all", () => {
    const v = classify(evidence());
    expect(v.status).toBe(CorrectnessStatus.UNKNOWN);
  });

  it("DEFINITIVELY_INCORRECT + COMPILE_ERROR when compilation fails, before any test evidence is consulted", () => {
    const v = classify(
      evidence({
        compilation: { attempted: true, success: false, diagnostics: ["error: expected ';' before '}' token"] },
        tests: { totalAvailable: 10, gradingComplete: true, results: [t("t1", TestOutcome.PASS)] }, // present but must be ignored
      })
    );
    expect(v.status).toBe(CorrectnessStatus.DEFINITIVELY_INCORRECT);
    expect(v.errorCategory).toBe(ErrorCategory.COMPILE_ERROR);
    expect(v.confidence.level).toBe(ConfidenceLevel.HIGH);
    // Must not have been swayed by the (contradictory, and in reality impossible) passing test.
    expect(v.summary).toMatch(/compilation failed/i);
  });

  it("ACCEPTED only when the FULL authoritative (gradingComplete) suite passes", () => {
    const v = classify(
      evidence({
        tests: {
          totalAvailable: 10,
          gradingComplete: true,
          results: Array.from({ length: 10 }, (_, i) => t(`t${i}`, TestOutcome.PASS)),
        },
      })
    );
    expect(v.status).toBe(CorrectnessStatus.ACCEPTED);
  });

  it("does NOT claim ACCEPTED on a passing but non-authoritative (public-only) subset — reports LIKELY_CORRECT instead", () => {
    const v = classify(
      evidence({
        tests: {
          totalAvailable: 3,
          gradingComplete: false,
          results: [t("t1", TestOutcome.PASS), t("t2", TestOutcome.PASS), t("t3", TestOutcome.PASS)],
        },
      })
    );
    expect(v.status).toBe(CorrectnessStatus.LIKELY_CORRECT);
    expect(v.status).not.toBe(CorrectnessStatus.ACCEPTED);
  });

  it("wrong answer: mixed WRONG_ANSWER failures across all available tests", () => {
    const v = classify(
      evidence({
        tests: {
          totalAvailable: 4,
          gradingComplete: true,
          results: [
            t("t1", TestOutcome.WRONG_ANSWER, [], { mismatchType: "VALUE" as any }),
            t("t2", TestOutcome.WRONG_ANSWER, [], { mismatchType: "VALUE" as any }),
            t("t3", TestOutcome.WRONG_ANSWER),
            t("t4", TestOutcome.WRONG_ANSWER),
          ],
        },
      })
    );
    expect(v.status).toBe(CorrectnessStatus.DEFINITIVELY_INCORRECT);
    expect(v.errorCategory).toBe(ErrorCategory.WRONG_ANSWER);
  });

  it("runtime error on every considered test", () => {
    const v = classify(
      evidence({
        tests: {
          totalAvailable: 2,
          gradingComplete: false,
          results: [t("t1", TestOutcome.RUNTIME_ERROR), t("t2", TestOutcome.RUNTIME_ERROR)],
        },
      })
    );
    expect(v.errorCategory).toBe(ErrorCategory.RUNTIME_ERROR);
    expect(v.status).toBe(CorrectnessStatus.LIKELY_INCORRECT); // not gradingComplete -> not "definitive"
  });

  it("timeout on every considered test", () => {
    const v = classify(
      evidence({
        tests: { totalAvailable: 1, gradingComplete: false, results: [t("t1", TestOutcome.TIMEOUT)] },
      })
    );
    expect(v.errorCategory).toBe(ErrorCategory.TIMEOUT);
  });

  it("memory failure on every considered test", () => {
    const v = classify(
      evidence({
        tests: { totalAvailable: 1, gradingComplete: false, results: [t("t1", TestOutcome.MEMORY_EXCEEDED)] },
      })
    );
    expect(v.errorCategory).toBe(ErrorCategory.MEMORY_LIMIT_EXCEEDED);
  });

  it("boundary bug: only boundary-tagged tests fail -> clustered under 'boundary'", () => {
    const v = classify(
      evidence({
        tests: {
          totalAvailable: 5,
          gradingComplete: true,
          results: [
            t("t1", TestOutcome.PASS, ["normal"]),
            t("t2", TestOutcome.PASS, ["normal"]),
            t("t3", TestOutcome.PASS, ["normal"]),
            t("t4", TestOutcome.WRONG_ANSWER, ["boundary", "empty"]),
            t("t5", TestOutcome.WRONG_ANSWER, ["boundary"]),
          ],
        },
      })
    );
    expect(v.status).toBe(CorrectnessStatus.PARTIALLY_VALIDATED);
    const boundaryCluster = v.clusters.find((c) => c.sharedTags.includes("boundary"));
    expect(boundaryCluster).toBeDefined();
    expect(boundaryCluster!.testIds.sort()).toEqual(["t4", "t5"]);
    expect(boundaryCluster!.hypothesis).toMatch(/boundary/i);
  });

  it("duplicate-value bug: only duplicate-tagged tests fail", () => {
    const v = classify(
      evidence({
        tests: {
          totalAvailable: 4,
          gradingComplete: true,
          results: [
            t("t1", TestOutcome.PASS, ["normal"]),
            t("t2", TestOutcome.PASS, ["normal"]),
            t("t3", TestOutcome.WRONG_ANSWER, ["duplicate-values"]),
            t("t4", TestOutcome.WRONG_ANSWER, ["duplicate-values"]),
          ],
        },
      })
    );
    const cluster = v.clusters.find((c) => c.sharedTags.includes("duplicate-values"));
    expect(cluster).toBeDefined();
    expect(cluster!.hypothesis.toLowerCase()).toContain("duplicate");
  });

  it("negative-value bug: only negative-tagged tests fail", () => {
    const v = classify(
      evidence({
        tests: {
          totalAvailable: 4,
          gradingComplete: true,
          results: [
            t("t1", TestOutcome.PASS, ["normal"]),
            t("t2", TestOutcome.PASS, ["normal"]),
            t("t3", TestOutcome.WRONG_ANSWER, ["negative-values"]),
            t("t4", TestOutcome.WRONG_ANSWER, ["negative-values"]),
          ],
        },
      })
    );
    const cluster = v.clusters.find((c) => c.sharedTags.includes("negative-values"));
    expect(cluster).toBeDefined();
    expect(cluster!.hypothesis.toLowerCase()).toContain("negative");
  });

  it("partial correctness: some pass, some fail -> PARTIALLY_VALIDATED, never flattened to a binary label", () => {
    const v = classify(
      evidence({
        tests: {
          totalAvailable: 10,
          gradingComplete: true,
          results: [
            ...Array.from({ length: 6 }, (_, i) => t(`p${i}`, TestOutcome.PASS)),
            ...Array.from({ length: 4 }, (_, i) => t(`f${i}`, TestOutcome.WRONG_ANSWER)),
          ],
        },
      })
    );
    expect(v.status).toBe(CorrectnessStatus.PARTIALLY_VALIDATED);
    expect(v.passed).toBe(6);
    expect(v.failed).toBe(4);
    expect(v.passRateAvailable).toBeCloseTo(0.6);
  });

  it("hypotheses are always phrased as possibilities, never as proven facts", () => {
    const v = classify(
      evidence({
        tests: {
          totalAvailable: 3,
          gradingComplete: true,
          results: [t("t1", TestOutcome.PASS), t("t2", TestOutcome.WRONG_ANSWER, ["boundary"])],
        },
      })
    );
    for (const c of v.clusters) {
      expect(c.hypothesis.toLowerCase()).toMatch(/possible|no shared characteristic/);
    }
  });
});
