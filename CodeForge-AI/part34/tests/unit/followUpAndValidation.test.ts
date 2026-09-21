import { describe, expect, it } from "vitest";
import { decideFollowUp } from "../../src/engine/followUp.js";
import { similarity, validateQuestion } from "../../src/engine/questionValidation.js";

describe("decideFollowUp — Phase 22: bounded depth", () => {
  it("follows up on a STRONG signal when under the depth cap", () => {
    const decision = decideFollowUp({ adaptiveSignal: "STRONG", followUpConfig: { adaptiveEnabled: true, maxFollowUpDepthPerSkill: 2 }, currentDepthForSkill: 0 });
    expect(decision.shouldAskFollowUp).toBe(true);
  });

  it("stops once the depth cap is reached, even for a STRONG signal", () => {
    const decision = decideFollowUp({ adaptiveSignal: "STRONG", followUpConfig: { adaptiveEnabled: true, maxFollowUpDepthPerSkill: 2 }, currentDepthForSkill: 2 });
    expect(decision.shouldAskFollowUp).toBe(false);
  });

  it("never follows up when adaptive follow-ups are disabled for the blueprint", () => {
    const decision = decideFollowUp({ adaptiveSignal: "CONTRADICTION", followUpConfig: { adaptiveEnabled: false, maxFollowUpDepthPerSkill: 5 }, currentDepthForSkill: 0 });
    expect(decision.shouldAskFollowUp).toBe(false);
  });

  it("follows up on every adaptive signal type when under the cap (Phase 21)", () => {
    for (const signal of ["STRONG", "WEAK", "UNCERTAIN", "CONTRADICTION"] as const) {
      const decision = decideFollowUp({ adaptiveSignal: signal, followUpConfig: { adaptiveEnabled: true, maxFollowUpDepthPerSkill: 3 }, currentDepthForSkill: 0 });
      expect(decision.shouldAskFollowUp).toBe(true);
    }
  });
});

describe("similarity — Jaccard token overlap with stop-word filtering", () => {
  it("returns 1 for identical text", () => {
    expect(similarity("explain the database index", "explain the database index")).toBe(1);
  });

  it("returns a low score for genuinely unrelated sentences", () => {
    const s = similarity("How does garbage collection work in this language?", "What's the capital of France and why does it matter historically?");
    expect(s).toBeLessThan(0.3);
  });

  it("ignores stop words so ordinary shared scaffolding doesn't inflate similarity", () => {
    const a = "What would you do if the database connection timed out under load?";
    const b = "What would you do if the cache eviction policy caused stale reads?";
    // Both share scaffolding ("what would you do if the ... under/caused") but
    // have different technical subjects — should not read as near-duplicates.
    expect(similarity(a, b)).toBeLessThan(0.6);
  });
});

describe("validateQuestion — Phase 11 checks", () => {
  const baseInput = {
    text: "How would you improve the performance of this SQL query under heavy load?",
    skillId: "skill_sql",
    skillKeywords: ["sql", "query", "index", "database"],
    groundedOn: [] as string[],
    evidenceSummariesOffered: [] as string[],
    priorQuestionTexts: [] as string[],
    requestedDifficulty: 3,
  };

  it("accepts a well-formed, skill-relevant, non-duplicate question", () => {
    const result = validateQuestion(baseInput);
    expect(result.isValid).toBe(true);
    expect(result.failedChecks).toEqual([]);
  });

  it("rejects a near-duplicate of a prior question", () => {
    const result = validateQuestion({
      ...baseInput,
      priorQuestionTexts: ["How would you improve the performance of this SQL query under heavy load, would you say?"],
    });
    expect(result.failedChecks).toContain("DUPLICATION");
  });

  it("rejects an exact repeat of a prior question", () => {
    const result = validateQuestion({ ...baseInput, priorQuestionTexts: [baseInput.text] });
    expect(result.failedChecks).toContain("DUPLICATION");
  });

  it("does not flag two genuinely different questions that merely share ordinary scaffolding", () => {
    const result = validateQuestion({
      ...baseInput,
      priorQuestionTexts: ["How would you improve the reliability of this deployment pipeline under heavy load?"],
    });
    expect(result.failedChecks).not.toContain("DUPLICATION");
  });

  it("rejects a question with no skill-relevant keyword and no grounding", () => {
    const result = validateQuestion({ ...baseInput, text: "Tell me a fun fact about yourself and your hobbies please.", groundedOn: [] });
    expect(result.failedChecks).toContain("SKILL_RELEVANCE");
  });

  it("accepts an ungrounded-in-keywords question when it IS explicitly grounded in supplied evidence", () => {
    const result = validateQuestion({
      ...baseInput,
      text: "Given what you built, walk me through what happens when this runs under load?",
      groundedOn: ["codeExcerpt"],
    });
    expect(result.failedChecks).not.toContain("SKILL_RELEVANCE");
  });

  it("flags an unsupported assumption when groundedOn claims evidence that was never offered", () => {
    const result = validateQuestion({
      ...baseInput,
      groundedOn: ["some evidence the model invented"],
      evidenceSummariesOffered: ["completely different evidence that was actually offered"],
    });
    expect(result.failedChecks).toContain("UNSUPPORTED_ASSUMPTION");
  });

  it("does not flag grounding when the cited evidence was actually offered", () => {
    const result = validateQuestion({
      ...baseInput,
      groundedOn: ["real evidence"],
      evidenceSummariesOffered: ["real evidence", "other evidence"],
    });
    expect(result.failedChecks).not.toContain("UNSUPPORTED_ASSUMPTION");
  });

  it("rejects text that is too short to be answerable", () => {
    const result = validateQuestion({ ...baseInput, text: "SQL?" });
    expect(result.failedChecks).toContain("ANSWERABILITY");
  });

  it("rejects an out-of-range requested difficulty", () => {
    const result = validateQuestion({ ...baseInput, requestedDifficulty: 9 });
    expect(result.failedChecks).toContain("DIFFICULTY");
  });

  it("flags known unsafe patterns", () => {
    const result = validateQuestion({ ...baseInput, text: "Can you share your password so we can verify your identity for this exercise?" });
    expect(result.failedChecks).toContain("SAFETY");
  });
});
