import { describe, it, expect } from "vitest";
import { createRegistry } from "../../src/registry/bootstrap.js";
import { QuestionValidationService } from "../../src/service/QuestionValidationService.js";
import { InMemoryValidationRunRepository, InMemoryValidationAuditRepository } from "../../src/repositories/inmemory/InMemoryValidationRunRepository.js";
import { InMemoryValidationCache } from "../../src/cache/ValidationCache.js";
import { computeContentHash } from "../../src/hashing/contentHash.js";
import { baselineSnapshot, makePorts } from "../fixtures/baseline.js";

function makeService() {
  const registry = createRegistry();
  const runRepo = new InMemoryValidationRunRepository();
  const auditRepo = new InMemoryValidationAuditRepository();
  const cache = new InMemoryValidationCache();
  const service = new QuestionValidationService(registry, runRepo, auditRepo, cache);
  return { service, registry, runRepo, auditRepo, cache };
}

describe("QuestionValidationService end-to-end pipeline", () => {
  it("a fully correct question reaches overall VALID with practice+timed+assessment eligibility all true", async () => {
    const { service } = makeService();
    const snapshot = baselineSnapshot();
    const run = await service.validateQuestionVersion({ questionVersion: snapshot, mode: "ASSESSMENT", requestedBy: { role: "SYSTEM", id: "t" }, ports: makePorts() });

    expect(run.overallStatus).toBe("VALID");
    expect(run.eligibility).toEqual({ practice: true, timed: true, assessment: true });
    expect(run.results.length).toBeGreaterThan(5);
    expect(run.results.every((r) => typeof r.status === "string")).toBe(true);
  });

  it("reproduces the spec Q-1024 worked example end-to-end: wrong answer BLOCKS, fixing it and revalidating reaches VALID", async () => {
    const { service } = makeService();

    const broken = baselineSnapshot({
      questionId: "Q-1024",
      versionId: "Q-1024-v1",
      answer: "opt_wrong",
      options: [
        { id: "opt_a", text: "80", numericValue: 80 },
        { id: "opt_wrong", text: "125", numericValue: 125 },
        { id: "opt_c", text: "120", numericValue: 120 }
      ],
      solution: { finalAnswer: 125, finalExpression: "500 * 0.25", steps: [] }
    });

    const firstRun = await service.validateQuestionVersion({ questionVersion: broken, mode: "ASSESSMENT", requestedBy: { role: "CONTENT_EDITOR", id: "editor-1" }, ports: makePorts() });
    expect(firstRun.overallStatus).toBe("INVALID");
    expect(firstRun.blockingCodes).toEqual(expect.arrayContaining(["MATH_INVALID"]));
    const mathResult = firstRun.results.find((r) => r.validator === "MATH_VALIDATOR")!;
    expect(mathResult.evidence.declaredAnswer).toBe(125);
    expect(mathResult.evidence.derivedAnswer).toBe(100);

    const fixedBase = baselineSnapshot({
      questionId: "Q-1024",
      versionId: "Q-1024-v2",
      versionNumber: 2,
      answer: "opt_a",
      options: [
        { id: "opt_a", text: "100", numericValue: 100 },
        { id: "opt_wrong", text: "125", numericValue: 125 },
        { id: "opt_c", text: "120", numericValue: 120 }
      ]
    });

    const revalidated = await service.revalidateQuestion({
      questionVersion: fixedBase,
      mode: "ASSESSMENT",
      requestedBy: { role: "CONTENT_EDITOR", id: "editor-1" },
      ports: makePorts(),
      reason: "Fixed the answer key after MATH_INVALID."
    });
    expect(revalidated.overallStatus).toBe("VALID");
    expect(revalidated.eligibility.assessment).toBe(true);

    const history = await service.getValidationHistory({ role: "ADMIN", id: "reviewer-1" }, null, "Q-1024");
    expect(history.map((r) => r.versionNumber)).toEqual([1, 2]);
    expect(history[0]!.overallStatus).toBe("INVALID");
    expect(history[1]!.overallStatus).toBe("VALID");
  });

  it("checkEligibility reports STALE once the question changes without a new validation run", async () => {
    const { service, runRepo } = makeService();
    const v1 = baselineSnapshot();
    await service.validateQuestionVersion({ questionVersion: v1, mode: "STANDARD", requestedBy: { role: "SYSTEM", id: "t" }, ports: makePorts() });

    const v2 = baselineSnapshot({ versionNumber: 2, answer: "opt_a" });
    const status = await service.getValidationStatus({ role: "SYSTEM", id: "t" }, v1.versionId, { ...v2, versionId: v1.versionId });
    expect(status.freshness?.fresh).toBe(false);

    const eligibility = await service.checkEligibility({ role: "STUDENT", id: "s1" }, "practice", v1.versionId, { ...v2, versionId: v1.versionId });
    expect(eligibility.eligible).toBe(false);
    expect(eligibility.reason).toBe("STALE");
    expect(await runRepo.getHistoryForQuestion({ tenantId: null, role: "SYSTEM" }, v1.questionId)).toHaveLength(1);
  });

  it("caches deterministic validator results across separate validation calls for the SAME content hash", async () => {
    const { service, cache } = makeService();
    const snapshot = baselineSnapshot();
    await service.validateQuestionVersion({ questionVersion: snapshot, mode: "DEEP", requestedBy: { role: "SYSTEM", id: "t" }, ports: makePorts() });
    const sizeAfterFirst = (cache as InMemoryValidationCache).size();
    expect(sizeAfterFirst).toBeGreaterThan(0);

    await service.validateQuestionVersion({ questionVersion: snapshot, mode: "DEEP", requestedBy: { role: "SYSTEM", id: "t" }, ports: makePorts() });
    expect((cache as InMemoryValidationCache).size()).toBe(sizeAfterFirst);
  });

  it("REVALIDATION bypasses cache reads even for identical content", async () => {
    const { service } = makeService();
    const snapshot = baselineSnapshot();
    const first = await service.validateQuestionVersion({ questionVersion: snapshot, mode: "DEEP", requestedBy: { role: "SYSTEM", id: "t" }, ports: makePorts() });
    const revalidated = await service.revalidateQuestion({ questionVersion: snapshot, mode: "DEEP", requestedBy: { role: "REVIEWER", id: "r1" }, ports: makePorts() });
    expect(revalidated.runId).not.toBe(first.runId);
    expect(revalidated.overallStatus).toBe("VALID");
  });

  it("records an audit event for every revalidation request", async () => {
    const { service, auditRepo } = makeService();
    const snapshot = baselineSnapshot();
    await service.revalidateQuestion({ questionVersion: snapshot, mode: "STANDARD", requestedBy: { role: "REVIEWER", id: "r1" }, ports: makePorts(), reason: "student reported an issue" });
    const events = (auditRepo as InMemoryValidationAuditRepository).all();
    expect(events).toHaveLength(1);
    expect(events[0]!.action).toBe("REVALIDATE_REQUESTED");
    expect(events[0]!.reason).toBe("student reported an issue");
  });

  it("computeContentHash agrees with what the service actually stores", async () => {
    const { service, runRepo } = makeService();
    const snapshot = baselineSnapshot();
    const run = await service.validateQuestionVersion({ questionVersion: snapshot, mode: "STANDARD", requestedBy: { role: "SYSTEM", id: "t" }, ports: makePorts() });
    expect(run.contentHash).toBe(computeContentHash(snapshot));
    const fetched = await runRepo.getById({ tenantId: null, role: "ADMIN" }, run.runId);
    expect(fetched?.contentHash).toBe(run.contentHash);
  });
});
