import { describe, it, expect } from "vitest";
import { runReasoningVerification, reVerifyWithFollowUp } from "../src/pipeline.js";
import { MockAIProvider } from "../src/ai/provider.js";
import {
  TWO_SUM_HASHMAP,
  PAIR_SUM_NESTED,
  REASONING_TWO_SUM_CORRECT,
  REASONING_CLAIMS_LINEAR_BUT_CODE_IS_QUADRATIC,
  REASONING_PROMPT_INJECTION,
} from "./fixtures.js";

const adapters = { ai: new MockAIProvider() };

describe("end-to-end: strong understanding (two-sum via hashmap, correct reasoning)", () => {
  it("produces a high score with no HIGH-severity contradictions", async () => {
    const result = await runReasoningVerification({
      submissionId: "sub_1",
      sourceCode: TWO_SUM_HASHMAP,
      reasoningText: REASONING_TWO_SUM_CORRECT,
      adapters,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.score.overall).toBeGreaterThanOrEqual(75);
    expect(result.value.understanding).not.toBe("WEAK");
    expect(result.value.contradictions.filter((c) => c.severity === "HIGH")).toHaveLength(0);
    expect(result.value.agreements.length).toBeGreaterThan(0);
  });
});

describe("end-to-end: flagship mismatch — \"this is O(n)\" claimed over genuinely O(n^2) code", () => {
  it("surfaces the exact mismatch described in the spec's own worked example, with a targeted follow-up", async () => {
    const result = await runReasoningVerification({
      submissionId: "sub_2",
      sourceCode: PAIR_SUM_NESTED,
      reasoningText: REASONING_CLAIMS_LINEAR_BUT_CODE_IS_QUADRATIC,
      adapters,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const complexityMismatch = result.value.contradictions.find((c) => c.category === "COMPLEXITY_MISMATCH");
    expect(complexityMismatch).toBeDefined();
    expect(complexityMismatch!.severity).toBe("HIGH");
    expect(complexityMismatch!.studentClaim).toMatch(/O\(n\)/);
    expect(complexityMismatch!.actualEvidence).toMatch(/O\(n\^2\)/);

    const complexityDim = result.value.score.dimensions.find((d) => d.dimension === "Complexity Understanding");
    expect(complexityDim!.score).toBeLessThan(50);

    const followUp = result.value.followUpQuestions.find((q) => q.type === "WHY_IS_THIS_COMPLEXITY");
    expect(followUp).toBeDefined();
    expect(result.value.understanding).not.toBe("STRONG");
  });
});

describe("end-to-end: prompt-injection resistance", () => {
  it("does not let an override attempt inflate the score — the false O(1) claim is still contradicted against real O(n^2) code", async () => {
    const result = await runReasoningVerification({
      submissionId: "sub_3",
      sourceCode: PAIR_SUM_NESTED,
      reasoningText: REASONING_PROMPT_INJECTION,
      adapters,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.score.overall).toBeLessThan(100);
    const complexityMismatch = result.value.contradictions.find((c) => c.category === "COMPLEXITY_MISMATCH");
    expect(complexityMismatch).toBeDefined();
    expect(complexityMismatch!.studentClaim).toMatch(/O\(1\)/);
  });
});

describe("end-to-end: NO_REASONING failure path", () => {
  it("fails explicitly rather than producing an empty-but-successful report", async () => {
    const result = await runReasoningVerification({
      submissionId: "sub_4",
      sourceCode: TWO_SUM_HASHMAP,
      reasoningText: "   ",
      adapters,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("NO_REASONING");
  });
});

describe("end-to-end: follow-up re-verification", () => {
  it("increments reasoningVersion and can resolve a previously-missing claim once the student states it", async () => {
    const initial = await runReasoningVerification({
      submissionId: "sub_5",
      sourceCode: TWO_SUM_HASHMAP,
      reasoningText: "I solved it and it passes all the tests.",
      adapters,
    });
    expect(initial.ok).toBe(true);
    if (!initial.ok) return;
    expect(initial.value.claims.some((c) => c.claimType === "COMPLEXITY")).toBe(false);

    const followUp = await reVerifyWithFollowUp({
      previousReport: initial.value,
      followUpAnswer: "I use a hash map to check for the complement in O(1), so the whole thing runs in O(n) time.",
      sourceCode: TWO_SUM_HASHMAP,
      adapters,
    });
    expect(followUp.ok).toBe(true);
    if (!followUp.ok) return;

    expect(followUp.value.reasoningVersion).toBe(initial.value.reasoningVersion + 1);
    const complexityClaim = followUp.value.claims.find((c) => c.claimType === "COMPLEXITY");
    expect(complexityClaim).toBeDefined();
    const v = followUp.value.verifications.find((v) => v.claimId === complexityClaim!.claimId);
    expect(v?.status).toBe("SUPPORTED");
  });
});
