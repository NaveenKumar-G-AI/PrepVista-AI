import { test } from "node:test";
import assert from "node:assert/strict";

import { firstHintSuccessRate, recoveryRate, HintRecord } from "../src/analytics/analytics";
import { HintInteraction, HintOutcomeResultEnum } from "../src/domain/types";

function fakeInteraction(id: string, stepId: string): HintInteraction {
  return {
    id,
    sessionId: "s1",
    studentId: "student-1",
    problemId: "percentage-basic-1",
    stepId,
    attemptContextVersion: 1,
    trigger: "EXPLICIT_REQUEST" as any,
    blockType: "INPUT_MAPPING_BLOCK" as any,
    hintType: "INPUT_MAPPING" as any,
    hintLevel: 2 as any,
    strategyTag: "DIRECT_CLUE",
    revealsAnswer: false,
    message: "x",
    rationale: "x",
    requestedOrAutomatic: "REQUESTED",
    shownAt: new Date().toISOString(),
  };
}

test("firstHintSuccessRate and recoveryRate compute sensible rates from mixed outcomes", () => {
  const records: HintRecord[] = [
    { interaction: fakeInteraction("a", "execution"), outcome: { interactionId: "a", result: HintOutcomeResultEnum.SUCCESS, recordedAt: "t" } },
    { interaction: fakeInteraction("b", "strategy"), outcome: { interactionId: "b", result: HintOutcomeResultEnum.NO_EFFECT, recordedAt: "t" } },
  ];
  assert.equal(firstHintSuccessRate(records), 0.5);
  assert.equal(recoveryRate(records), 0.5);
});

test("empty history returns 0 rather than NaN or throwing", () => {
  assert.equal(firstHintSuccessRate([]), 0);
  assert.equal(recoveryRate([]), 0);
});
