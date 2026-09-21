import { test } from "node:test";
import assert from "node:assert/strict";

import { decide } from "../src/policy/hintPolicyEngine";
import { HintInteraction, HintLevel, HintOutcome, HintOutcomeResultEnum } from "../src/domain/types";
import { baseRequest, interactionFrom, outcomeFor } from "./helpers";

test('repeated "still stuck" walks through distinct strategies before ever repeating one', () => {
  let priorHints: HintInteraction[] = [];
  let priorOutcomes: HintOutcome[] = [];
  const seenBeforeWorkedStep = new Set<string>();
  let last;

  for (let i = 0; i < 6; i++) {
    const req = baseRequest({ priorHintsThisStep: priorHints, priorOutcomesThisStep: priorOutcomes, sameErrorStreak: i + 1, attemptCountOnStep: i + 1 });
    const decision = decide(req);
    if (!decision.shouldOffer) break;

    if (decision.strategyTag !== "WORKED_STEP") {
      assert.ok(!seenBeforeWorkedStep.has(decision.strategyTag), `strategy "${decision.strategyTag}" was reused before reaching a worked step`);
      seenBeforeWorkedStep.add(decision.strategyTag);
    }

    const interaction = interactionFrom(decision, req);
    const outcome = outcomeFor(interaction, HintOutcomeResultEnum.NO_EFFECT); // every hint "fails" to force escalation
    priorHints = [...priorHints, interaction];
    priorOutcomes = [...priorOutcomes, outcome];
    last = decision;
  }

  assert.ok(last, "engine should have offered at least one hint");
  assert.ok(last!.hintLevel >= HintLevel.L4_PARTIAL_WORKING, `repeated failure should escalate meaningfully, ended at ${last!.hintLevel}`);
});

test('"that helped" stops further auto-escalation on that step', () => {
  const firstReq = baseRequest();
  const firstDecision = decide(firstReq);
  const interaction = interactionFrom(firstDecision, firstReq);
  const successOutcome = outcomeFor(interaction, HintOutcomeResultEnum.SUCCESS);

  const decision = decide(baseRequest({ priorHintsThisStep: [interaction], priorOutcomesThisStep: [successOutcome] }));
  assert.equal(decision.shouldOffer, false, "should not keep offering hints after a success outcome");
});

test("a fresh explicit request on a step with no history starts at the minimum-sufficient level for its block", () => {
  const decision = decide(baseRequest({ priorHintsThisStep: [], priorOutcomesThisStep: [], sameErrorStreak: 1 }));
  assert.ok(decision.hintLevel <= HintLevel.L2_CONCEPTUAL, "first hint on a step should never start deep");
});
