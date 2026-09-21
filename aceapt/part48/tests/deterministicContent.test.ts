/**
 * This test exists because a live smoke-test run caught a real bug: one hand-authored
 * deterministic template exceeded its level's word budget and got (correctly) rejected by the
 * validator, silently falling back to the generic safety message instead of showing the good
 * curated content. That's the validator doing its job, but it means the *content* had a bug.
 * This test sweeps the full matrix so a content-authoring mistake like that fails loudly here
 * instead of showing up as a degraded hint in production.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { decide } from "../src/policy/hintPolicyEngine";
import { DeterministicHintGenerator } from "../src/generation/hintGenerator";
import { validateHint } from "../src/validation/hintValidator";
import { SAMPLE_QUESTIONS } from "../src/domain/sampleData";
import { baseRequest, interactionFrom, outcomeFor } from "./helpers";
import { AttemptSnapshot, HintInteraction, HintOutcome, HintOutcomeResultEnum, MistakeSignal } from "../src/domain/types";

const SIGNALS_TO_SWEEP: (MistakeSignal | "NO_ATTEMPT_YET")[] = [
  "NO_ATTEMPT_YET",
  MistakeSignal.WRONG_STRATEGY,
  MistakeSignal.WRONG_FORMULA,
  MistakeSignal.WRONG_REFERENCE_VALUE,
  MistakeSignal.CALCULATION_ERROR,
  MistakeSignal.MISREAD_QUESTION,
  MistakeSignal.UNIT_ERROR,
  MistakeSignal.CONCEPT_ERROR,
];

test("deterministic templates pass validation across every problem x step x mistake signal x escalation depth", async () => {
  const generator = new DeterministicHintGenerator();
  const failures: string[] = [];

  for (const question of SAMPLE_QUESTIONS) {
    for (const step of question.solutionSteps) {
      for (const signal of SIGNALS_TO_SWEEP) {
        let priorHints: HintInteraction[] = [];
        let priorOutcomes: HintOutcome[] = [];

        for (let depth = 0; depth < 4; depth++) {
          const attempt: AttemptSnapshot | undefined =
            signal === "NO_ATTEMPT_YET" ? undefined : { raw: "x", isCorrect: false, mistakeSignal: signal };

          const req = baseRequest({
            problemId: question.problemId,
            skillId: question.skillId,
            stepId: step.stepId,
            attempt,
            attemptCountOnStep: signal === "NO_ATTEMPT_YET" ? 0 : depth + 1,
            sameErrorStreak: depth + 1,
            priorHintsThisStep: priorHints,
            priorOutcomesThisStep: priorOutcomes,
          });

          const decision = decide(req);
          if (!decision.shouldOffer) break;

          const generated = await generator.generate({ decision, question, hintHistoryThisStep: [] });
          const validation = validateHint(generated, { question, decision });
          if (!validation.valid) {
            failures.push(
              `${question.problemId} / ${step.stepId} / ${signal} / depth ${depth}: [${validation.reasons.join(", ")}] -- "${generated.message}"`,
            );
          }

          const interaction = interactionFrom(decision, req);
          priorHints = [...priorHints, interaction];
          priorOutcomes = [...priorOutcomes, outcomeFor(interaction, HintOutcomeResultEnum.NO_EFFECT)];
        }
      }
    }
  }

  assert.deepEqual(failures, [], `${failures.length} deterministic hint(s) failed validation:\n${failures.join("\n")}`);
});
