/**
 * §114: "The most important test is: same problem, same student, different state... If these
 * cases do not produce meaningfully different behavior: THE HINT INTELLIGENCE ENGINE IS NOT
 * COMPLETE." These are cases A–F from that section, verbatim in intent.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { decide } from "../src/policy/hintPolicyEngine";
import { DependencyState, HintLevel, HintType, MistakeSignal, TriggerType } from "../src/domain/types";
import { baseRequest, interactionFrom, outcomeFor } from "./helpers";
import { HintOutcomeResultEnum } from "../src/domain/types";

test("Case A — correct strategy already chosen -> minimal execution guidance, not strategy/concept", () => {
  // Student is on the execution step; their wrong answer matches the classic "divided by the
  // new value instead of the original" slip. The strategy step is already behind them.
  const decision = decide(baseRequest());
  assert.equal(decision.hintType, HintType.INPUT_MAPPING);
  assert.ok(decision.hintLevel <= HintLevel.L2_CONCEPTUAL, `expected a minimal level, got ${decision.hintLevel}`);
});

test("Case B — wrong strategy chosen -> strategy guidance", () => {
  const decision = decide(
    baseRequest({
      stepId: "strategy",
      attempt: { raw: "opt_with_replacement", isCorrect: false, mistakeSignal: MistakeSignal.WRONG_STRATEGY },
    }),
  );
  assert.equal(decision.hintType, HintType.STRATEGY);
});

test("Case C — calculation error -> calculation hint, not a concept lecture", () => {
  const decision = decide(
    baseRequest({ attempt: { raw: "120", isCorrect: false, mistakeSignal: MistakeSignal.CALCULATION_ERROR } }),
  );
  assert.equal(decision.hintType, HintType.CALCULATION);
  assert.notEqual(decision.hintType, HintType.CONCEPT);
});

test("Case D — repeated failure -> higher assistance AND a different strategy than a single failure", () => {
  const single = decide(baseRequest({ sameErrorStreak: 1, attemptCountOnStep: 1 }));

  const firstReq = baseRequest();
  const firstDecision = decide(firstReq);
  const priorHint = interactionFrom(firstDecision, firstReq);
  const priorOutcome = outcomeFor(priorHint, HintOutcomeResultEnum.NO_EFFECT);

  const repeated = decide(
    baseRequest({
      sameErrorStreak: 3,
      attemptCountOnStep: 4,
      priorHintsThisStep: [priorHint],
      priorOutcomesThisStep: [priorOutcome],
    }),
  );

  assert.ok(repeated.hintLevel > single.hintLevel, `expected escalation: ${repeated.hintLevel} > ${single.hintLevel}`);
  assert.notEqual(repeated.strategyTag, single.strategyTag, "a failed hint must switch strategy, not just get louder");
});

test("Case E — student just recovered -> engine stops escalating and gives control back", () => {
  const decision = decide(
    baseRequest({
      trigger: TriggerType.STUCKNESS,
      priorOutcomesThisStep: [{ interactionId: "h1", result: HintOutcomeResultEnum.SUCCESS, recordedAt: new Date().toISOString() }],
    }),
  );
  assert.equal(decision.shouldOffer, false);
  assert.equal(decision.denialReason, "ALREADY_RESOLVED");
});

test("Case F — dependency state changes the starting level for a fresh problem on the same skill", () => {
  const low = decide(baseRequest({ dependencyState: DependencyState.LOW }));
  const high = decide(baseRequest({ dependencyState: DependencyState.HIGH }));
  assert.ok(low.hintLevel <= high.hintLevel, `expected LOW <= HIGH, got ${low.hintLevel} vs ${high.hintLevel}`);
  assert.notEqual(low.hintLevel, high.hintLevel, "dependency state should visibly move the starting level");
});

// --- A few supporting behaviours the spec calls out by name -------------------------------

test("§32/§72 — hints are refused outright in ASSESSMENT mode unless explicitly permitted", () => {
  const decision = decide(
    baseRequest({
      assessmentMode: "ASSESSMENT" as any,
      hintsExplicitlyPermittedInAssessment: false,
    }),
  );
  assert.equal(decision.shouldOffer, false);
  assert.equal(decision.denialReason, "ASSESSMENT_DISABLED");
});

test("§48 — a slow-but-not-evidenced STUCKNESS trigger is not enough on its own", () => {
  const decision = decide(
    baseRequest({
      trigger: TriggerType.STUCKNESS,
      attemptCountOnStep: 0,
      attempt: undefined,
      timeOnStepMs: 31_000,
      medianTimeForStepMs: 30_000, // barely over median, not 2.5x, and no failed attempts yet
    }),
  );
  assert.equal(decision.shouldOffer, false);
  assert.equal(decision.denialReason, "INSUFFICIENT_EVIDENCE");
});

test("§47 — a correct-looking guess gets a reasoning follow-up instead of a hint", () => {
  const decision = decide(
    baseRequest({ attempt: { raw: "20", isCorrect: true, mistakeSignal: MistakeSignal.GUESS_CORRECT } }),
  );
  assert.equal(decision.shouldOffer, false);
  assert.equal(decision.followUp, "ASK_REASONING_FOR_GUESS");
});

test("§93 — a unit-only check gets a one-line UNIT hint, not a full concept explanation", () => {
  const decision = decide(baseRequest({ explicitConfidenceSelfReport: "CHECKING_UNIT_ONLY" }));
  assert.equal(decision.hintType, HintType.UNIT);
  assert.equal(decision.hintLevel, HintLevel.L1_DIRECTIONAL);
});

test("§26 — level never silently jumps to a full solution outside the escalation sequence", () => {
  const decision = decide(baseRequest({ sameErrorStreak: 99, attemptCountOnStep: 99 }));
  assert.ok(decision.hintLevel < HintLevel.L6_WORKED_STEP, `runaway streak should not skip straight to a worked step: got ${decision.hintLevel}`);
});
