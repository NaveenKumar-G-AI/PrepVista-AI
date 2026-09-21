import { describe, it, expect } from "vitest";
import { computeContentHash } from "../../src/hashing/contentHash.js";
import { ValidationFreshnessService } from "../../src/freshness/ValidationFreshnessService.js";
import { baselineSnapshot } from "../fixtures/baseline.js";
import type { ValidationRunResult } from "../../src/contracts/types.js";

describe("computeContentHash", () => {
  it("is deterministic for the same content regardless of key order", () => {
    const a = computeContentHash(baselineSnapshot());
    const b = computeContentHash({ ...baselineSnapshot() });
    expect(a).toBe(b);
  });

  it("changes when the answer changes", () => {
    const a = computeContentHash(baselineSnapshot());
    const b = computeContentHash(baselineSnapshot({ answer: "opt_a" }));
    expect(a).not.toBe(b);
  });

  it("does NOT change when only updatedAt would differ (updatedAt is excluded from the hash)", () => {
    const s1 = baselineSnapshot();
    const s2 = { ...s1, updatedAt: new Date(Date.now() + 100000).toISOString() };
    expect(computeContentHash(s1)).toBe(computeContentHash(s2));
  });
});

function fakeRun(overrides: Partial<ValidationRunResult> = {}): ValidationRunResult {
  const snapshot = baselineSnapshot();
  return {
    runId: "run-1",
    questionId: snapshot.questionId,
    versionId: snapshot.versionId,
    versionNumber: 1,
    mode: "DEEP",
    profile: "TRANSFER_PROFILE",
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    results: [],
    overallStatus: "VALID",
    highestSeverity: "NONE",
    blockingCodes: [],
    eligibility: { practice: true, timed: true, assessment: false },
    contentHash: snapshot.contentHash,
    validatorVersionSet: { SCHEMA_VALIDATOR: "1.0.0", ANSWER_VALIDATOR: "1.0.0" },
    ...overrides
  };
}

describe("ValidationFreshnessService", () => {
  const service = new ValidationFreshnessService();

  it("is fresh when version, content hash, and validator versions all still match", () => {
    const snapshot = baselineSnapshot();
    const run = fakeRun({ versionNumber: snapshot.versionNumber, contentHash: snapshot.contentHash });
    const verdict = service.isFresh(run, snapshot, { SCHEMA_VALIDATOR: "1.0.0", ANSWER_VALIDATOR: "1.0.0" });
    expect(verdict.fresh).toBe(true);
  });

  it("is STALE when the question version number has moved on (spec §57-58, §198)", () => {
    const snapshot = baselineSnapshot({ versionNumber: 2 });
    const run = fakeRun({ versionNumber: 1 });
    const verdict = service.isFresh(run, snapshot, { SCHEMA_VALIDATOR: "1.0.0", ANSWER_VALIDATOR: "1.0.0" });
    expect(verdict.fresh).toBe(false);
    if (!verdict.fresh) expect(verdict.reasons.some((r) => r.kind === "VERSION_CHANGED")).toBe(true);
  });

  it("is STALE when a validator's version has changed since the run (spec §59, §140, §200)", () => {
    const snapshot = baselineSnapshot();
    const run = fakeRun({ contentHash: snapshot.contentHash, versionNumber: snapshot.versionNumber });
    const verdict = service.isFresh(run, snapshot, { SCHEMA_VALIDATOR: "1.0.0", ANSWER_VALIDATOR: "2.0.0" });
    expect(verdict.fresh).toBe(false);
    if (!verdict.fresh) expect(verdict.reasons.some((r) => r.kind === "VALIDATOR_VERSION_CHANGED")).toBe(true);
  });

  it("is STALE when a new validator has been added to the registry since the run", () => {
    const snapshot = baselineSnapshot();
    const run = fakeRun({ contentHash: snapshot.contentHash, versionNumber: snapshot.versionNumber, validatorVersionSet: { SCHEMA_VALIDATOR: "1.0.0" } });
    const verdict = service.isFresh(run, snapshot, { SCHEMA_VALIDATOR: "1.0.0", MATH_VALIDATOR: "1.0.0" });
    expect(verdict.fresh).toBe(false);
    if (!verdict.fresh) expect(verdict.reasons.some((r) => r.kind === "VALIDATOR_ADDED")).toBe(true);
  });
});
