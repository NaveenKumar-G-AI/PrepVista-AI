import { describe, it, expect } from "vitest";
import { orchestrateAIAnalysis, shouldInvokeAI } from "../../src/ai/orchestrator.js";
import { classify } from "../../src/deterministic/classify.js";
import { evidence, test as t } from "../fixtures/evidence.js";
import { TestOutcome, AIDegradationReason, CorrectnessStatus, ConfidenceLevel } from "../../src/domain/enums.js";
import { FakeProvider, timeoutError, httpError, rateLimitError } from "../fixtures/fakeProvider.js";
import { MemoryLogger } from "../../src/observability/logger.js";
import { MemoryMetrics } from "../../src/observability/metrics.js";
import type { PromptInput } from "../../src/ai/promptBuilder.js";

function promptInputFor(ev: ReturnType<typeof evidence>): PromptInput {
  const deterministic = classify(ev);
  return {
    ref: ev.ref,
    sourceCode: "def f(x):\n    return x\n",
    requirements: [],
    requirementCoverage: [],
    deterministic,
    staticFindings: [],
    previous: null,
  };
}

const validAiBody = {
  statusAssessment: CorrectnessStatus.PARTIALLY_VALIDATED,
  explanationConfidence: ConfidenceLevel.MEDIUM,
  summary: "Boundary cases fail.",
  findings: [],
  requirementNotes: [],
  rootCause: null,
  recommendedNextAction: "Check boundary handling.",
};

describe("shouldInvokeAI() — cost control", () => {
  it("skips AI for compile errors (already fully explained deterministically)", () => {
    const v = classify(
      evidence({ compilation: { attempted: true, success: false, diagnostics: ["error"] } })
    );
    expect(shouldInvokeAI(v)).toBe(false);
  });

  it("skips AI when everything passes (ACCEPTED)", () => {
    const v = classify(
      evidence({ tests: { totalAvailable: 2, gradingComplete: true, results: [t("t1", TestOutcome.PASS), t("t2", TestOutcome.PASS)] } })
    );
    expect(shouldInvokeAI(v)).toBe(false);
  });

  it("skips AI when there is no evidence yet (UNKNOWN)", () => {
    expect(shouldInvokeAI(classify(evidence()))).toBe(false);
  });

  it("calls AI for genuine partial correctness", () => {
    const v = classify(
      evidence({
        tests: {
          totalAvailable: 3,
          gradingComplete: true,
          results: [t("t1", TestOutcome.PASS), t("t2", TestOutcome.WRONG_ANSWER)],
        },
      })
    );
    expect(shouldInvokeAI(v)).toBe(true);
  });
});

describe("orchestrateAIAnalysis() — failure isolation", () => {
  it("returns a working deterministic-compatible result when the provider is null (AI disabled entirely)", async () => {
    const ev = evidence({
      tests: { totalAvailable: 2, gradingComplete: true, results: [t("t1", TestOutcome.PASS), t("t2", TestOutcome.WRONG_ANSWER)] },
    });
    const ai = await orchestrateAIAnalysis(promptInputFor(ev), { provider: null });
    expect(ai.available).toBe(false);
    expect(ai.degradationReason).toBe(AIDegradationReason.DISABLED);
    expect(ai.result).toBeNull();
  });

  it("degrades gracefully on provider timeout — does not throw", async () => {
    const ev = evidence({
      tests: { totalAvailable: 2, gradingComplete: true, results: [t("t1", TestOutcome.PASS), t("t2", TestOutcome.WRONG_ANSWER)] },
    });
    const provider = new FakeProvider({ kind: "throw", error: timeoutError() });
    const ai = await orchestrateAIAnalysis(promptInputFor(ev), { provider, maxRetries: 0 });
    expect(ai.available).toBe(false);
    expect(ai.degradationReason).toBe(AIDegradationReason.TIMEOUT);
  });

  it("degrades gracefully on provider HTTP failure — does not throw", async () => {
    const ev = evidence({
      tests: { totalAvailable: 2, gradingComplete: true, results: [t("t1", TestOutcome.PASS), t("t2", TestOutcome.WRONG_ANSWER)] },
    });
    const provider = new FakeProvider({ kind: "throw", error: httpError() });
    const ai = await orchestrateAIAnalysis(promptInputFor(ev), { provider, maxRetries: 0 });
    expect(ai.available).toBe(false);
    expect(ai.degradationReason).toBe(AIDegradationReason.PROVIDER_ERROR);
  });

  it("does not retry into a rate limit", async () => {
    const ev = evidence({
      tests: { totalAvailable: 2, gradingComplete: true, results: [t("t1", TestOutcome.PASS), t("t2", TestOutcome.WRONG_ANSWER)] },
    });
    const provider = new FakeProvider({ kind: "throw", error: rateLimitError() });
    const ai = await orchestrateAIAnalysis(promptInputFor(ev), { provider, maxRetries: 3 });
    expect(ai.degradationReason).toBe(AIDegradationReason.RATE_LIMITED);
    expect(provider.calls.length).toBe(1); // did not burn retries into a 429
  });

  it("retries once on malformed output, then succeeds on the second attempt", async () => {
    const ev = evidence({
      tests: { totalAvailable: 2, gradingComplete: true, results: [t("t1", TestOutcome.PASS), t("t2", TestOutcome.WRONG_ANSWER)] },
    });
    const provider = new FakeProvider({
      kind: "sequence",
      behaviors: [{ kind: "respond-raw", text: "not json at all" }, { kind: "respond", body: validAiBody }],
    });
    const ai = await orchestrateAIAnalysis(promptInputFor(ev), { provider, maxRetries: 1 });
    expect(ai.available).toBe(true);
    expect(provider.calls.length).toBe(2);
  });

  it("degrades to MALFORMED_RESPONSE after exhausting retries on persistently bad output", async () => {
    const ev = evidence({
      tests: { totalAvailable: 2, gradingComplete: true, results: [t("t1", TestOutcome.PASS), t("t2", TestOutcome.WRONG_ANSWER)] },
    });
    const provider = new FakeProvider({ kind: "respond-raw", text: "still not json" });
    const ai = await orchestrateAIAnalysis(promptInputFor(ev), { provider, maxRetries: 1 });
    expect(ai.available).toBe(false);
    expect(ai.degradationReason).toBe(AIDegradationReason.MALFORMED_RESPONSE);
    expect(provider.calls.length).toBe(2); // initial + 1 retry, then gives up
  });

  it("records provider/model/latency metadata on success", async () => {
    const ev = evidence({
      tests: { totalAvailable: 2, gradingComplete: true, results: [t("t1", TestOutcome.PASS), t("t2", TestOutcome.WRONG_ANSWER)] },
    });
    const provider = new FakeProvider({ kind: "respond", body: validAiBody, latencyMs: 250 });
    const ai = await orchestrateAIAnalysis(promptInputFor(ev), { provider });
    expect(ai.provider).toBe("fake");
    expect(ai.latencyMs).toBe(250);
  });

  it("logs and flags disagreement when AI's own opinion differs from the deterministic status, without exposing a way to act on it", async () => {
    const ev = evidence({
      tests: { totalAvailable: 2, gradingComplete: true, results: [t("t1", TestOutcome.PASS), t("t2", TestOutcome.WRONG_ANSWER)] },
    });
    // AI insists everything is ACCEPTED even though deterministic evidence says PARTIALLY_VALIDATED.
    const provider = new FakeProvider({ kind: "respond", body: { ...validAiBody, statusAssessment: CorrectnessStatus.ACCEPTED } });
    const logger = new MemoryLogger();
    const metrics = new MemoryMetrics();
    const ai = await orchestrateAIAnalysis(promptInputFor(ev), { provider, logger, metrics });
    expect(ai.disagreedWithDeterministic).toBe(true);
    expect(logger.entries.some((e) => e.event === "ai.disagreement_with_deterministic")).toBe(true);
    expect(metrics.counters.some((c) => c.name === "ai.disagreement_with_deterministic")).toBe(true);
    // Crucially: orchestrateAIAnalysis's return type has NO "status" field at
    // all — only ai.result.statusAssessment (advisory) — so there is no
    // field here that assembleCorrectnessAssessment() could even
    // accidentally wire up as authoritative. See src/index.ts.
    expect((ai as any).status).toBeUndefined();
  });
});
