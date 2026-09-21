import { test } from "node:test";
import assert from "node:assert/strict";

import { validateHint } from "../src/validation/hintValidator";
import { getTrustedQuestionOrThrow } from "../src/domain/sampleData";
import { GeneratedHint, HintLevel, HintType, PolicyDecision } from "../src/domain/types";

const question = getTrustedQuestionOrThrow("percentage-basic-1");

function decisionFixture(overrides: Partial<PolicyDecision> = {}): PolicyDecision {
  return {
    shouldOffer: true,
    blockType: "INPUT_MAPPING_BLOCK" as any,
    hintType: HintType.INPUT_MAPPING,
    hintLevel: HintLevel.L2_CONCEPTUAL,
    strategyTag: "DIRECT_CLUE",
    targetStepId: "execution",
    revealsAnswer: false,
    rationale: "",
    maxWords: 24,
    ...overrides,
  };
}

test("rejects a hint that leaks the final answer at a non-revealing level", () => {
  const generated: GeneratedHint = {
    message: "The answer is 20%, since 100/500*100 = 20.",
    hintType: HintType.INPUT_MAPPING,
    hintLevel: HintLevel.L2_CONCEPTUAL,
    revealsAnswer: false,
    confidence: "high",
    source: "LLM",
  };
  const result = validateHint(generated, { question, decision: decisionFixture() });
  assert.equal(result.valid, false);
  assert.ok(result.reasons.includes("LEAKS_FINAL_ANSWER"));
});

test("accepts a properly scoped hint that never states the answer", () => {
  const generated: GeneratedHint = {
    message: "Which value should sit on the bottom of the fraction — the amount before or after the change?",
    hintType: HintType.INPUT_MAPPING,
    hintLevel: HintLevel.L2_CONCEPTUAL,
    revealsAnswer: false,
    confidence: "high",
    source: "DETERMINISTIC",
  };
  const result = validateHint(generated, { question, decision: decisionFixture() });
  assert.equal(result.valid, true);
  assert.deepEqual(result.reasons, []);
});

test("a worked-step hint at a revealing level is allowed to state the value", () => {
  const generated: GeneratedHint = {
    message: "Increase = 600 − 500 = 100. Divide by the original value, 500, then multiply by 100 to get 20%.",
    hintType: HintType.INPUT_MAPPING,
    hintLevel: HintLevel.L6_WORKED_STEP,
    revealsAnswer: true,
    confidence: "high",
    source: "DETERMINISTIC",
  };
  const result = validateHint(generated, { question, decision: decisionFixture({ hintLevel: HintLevel.L6_WORKED_STEP, revealsAnswer: true }) });
  assert.equal(result.valid, true);
});

test("flags a hint whose stated type disagrees with what the policy engine decided", () => {
  const generated: GeneratedHint = {
    message: "Recall what percentage increase means as a concept.",
    hintType: HintType.CONCEPT,
    hintLevel: HintLevel.L2_CONCEPTUAL,
    revealsAnswer: false,
    confidence: "medium",
    source: "LLM",
  };
  const result = validateHint(generated, { question, decision: decisionFixture({ hintType: HintType.INPUT_MAPPING }) });
  assert.equal(result.valid, false);
  assert.ok(result.reasons.includes("TYPE_MISMATCH"));
});
