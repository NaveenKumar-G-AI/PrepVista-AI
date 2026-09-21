/**
 * HintPolicyEngine — §10.
 *
 * This is a deliberately boring, deterministic, rule-based decision engine, not a model call.
 * Spec §65 is explicit that cost/latency-sensitive, mechanical decisions ("is the budget used
 * up", "has the student recovered") should be code, not AI — and the final command at the
 * bottom of the spec is "DO NOT FABRICATE INTELLIGENCE". A rules engine you can unit-test against
 * named cases (§114) *is* the honest way to satisfy that. The LLM downstream only turns this
 * engine's decision into a sentence; it never decides whether to help, what kind, or how much.
 *
 * decide() is a pure function: same input, same output. That's what makes §10's requirement
 * ("the policy must be testable independently of the UI") possible at all.
 */

import {
  AssessmentMode,
  AttemptSnapshot,
  BlockType,
  DependencyState,
  HintLevel,
  HintOutcomeResultEnum,
  HintType,
  MistakeSignal,
  PolicyDecision,
  PolicyRequest,
  StrategyTag,
  TriggerType,
} from "../domain/types";

// -----------------------------------------------------------------------------------------
// Tuning tables. Every number in this file lives here, named, so a reviewer can see the whole
// policy surface in one place instead of hunting through branches.
// -----------------------------------------------------------------------------------------

/** §16 minimum-sufficient-hint: where each block type *starts* before any escalation. */
const BASELINE_LEVEL: Record<BlockType, HintLevel> = {
  [BlockType.STARTING_POINT_BLOCK]: HintLevel.L1_DIRECTIONAL,
  [BlockType.CONCEPT_BLOCK]: HintLevel.L2_CONCEPTUAL,
  [BlockType.STRATEGY_BLOCK]: HintLevel.L2_CONCEPTUAL,
  [BlockType.FORMULA_BLOCK]: HintLevel.L2_CONCEPTUAL,
  [BlockType.INPUT_MAPPING_BLOCK]: HintLevel.L2_CONCEPTUAL,
  [BlockType.CALCULATION_BLOCK]: HintLevel.L1_DIRECTIONAL,
  [BlockType.INTERPRETATION_BLOCK]: HintLevel.L2_CONCEPTUAL,
  [BlockType.VERIFICATION_BLOCK]: HintLevel.L1_DIRECTIONAL,
  [BlockType.CONFIDENCE_BLOCK]: HintLevel.L1_DIRECTIONAL,
  [BlockType.UNKNOWN]: HintLevel.L1_DIRECTIONAL,
};

/** §13/§14 — a block maps to a hint type by default; special-cases override this below. */
const BLOCK_TO_HINT_TYPE: Record<BlockType, HintType> = {
  [BlockType.STARTING_POINT_BLOCK]: HintType.STARTING_POINT,
  [BlockType.CONCEPT_BLOCK]: HintType.CONCEPT,
  [BlockType.STRATEGY_BLOCK]: HintType.STRATEGY,
  [BlockType.FORMULA_BLOCK]: HintType.FORMULA,
  [BlockType.INPUT_MAPPING_BLOCK]: HintType.INPUT_MAPPING,
  [BlockType.CALCULATION_BLOCK]: HintType.CALCULATION,
  [BlockType.INTERPRETATION_BLOCK]: HintType.INTERPRETATION,
  [BlockType.VERIFICATION_BLOCK]: HintType.VERIFICATION,
  [BlockType.CONFIDENCE_BLOCK]: HintType.VERIFICATION,
  [BlockType.UNKNOWN]: HintType.STARTING_POINT,
};

/**
 * §19–§20, §53, §90: a failed hint switches strategy, it doesn't just get louder. Each hint
 * type has its own ordered set of approaches; repeated failures walk forward through the list
 * and never repeat an entry until it's the last resort (a fully worked step).
 */
const DEFAULT_SEQUENCE: StrategyTag[] = ["DIRECT_CLUE", "EXAMPLE", "DECOMPOSITION", "WORKED_STEP"];
const STRATEGY_SEQUENCE: Partial<Record<HintType, StrategyTag[]>> = {
  [HintType.STRATEGY]: ["DIRECT_CLUE", "COMPARISON", "EXAMPLE", "WORKED_STEP"],
  [HintType.CONCEPT]: ["DIRECT_CLUE", "EXAMPLE", "COUNTEREXAMPLE", "WORKED_STEP"],
  [HintType.INPUT_MAPPING]: ["DIRECT_CLUE", "EXAMPLE", "DECOMPOSITION", "WORKED_STEP"],
  [HintType.STARTING_POINT]: ["DECOMPOSITION", "EXAMPLE", "DIRECT_CLUE", "WORKED_STEP"],
  [HintType.CALCULATION]: ["DIRECT_CLUE", "VERIFICATION", "EXAMPLE", "WORKED_STEP"],
};

/** §82 minimality — a soft budget the validator (§27) checks generated hints against. */
const MAX_WORDS_BY_LEVEL: Record<HintLevel, number> = {
  [HintLevel.L0_NONE]: 0,
  [HintLevel.L1_DIRECTIONAL]: 16,
  [HintLevel.L2_CONCEPTUAL]: 24,
  [HintLevel.L3_NEXT_ACTION]: 30,
  [HintLevel.L4_PARTIAL_WORKING]: 45,
  [HintLevel.L5_STEP_GUIDANCE]: 60,
  [HintLevel.L6_WORKED_STEP]: 90,
  [HintLevel.L7_COMPLETE_SOLUTION]: 130,
};

/** §37, §48 — cautious thresholds; a passive trigger needs real evidence, not just elapsed time. */
const STALL_RATIO_THRESHOLD = 2.5;
const MIN_ATTEMPTS_FOR_STUCKNESS = 2;

function clampLevel(n: number, min = HintLevel.L0_NONE, max = HintLevel.L7_COMPLETE_SOLUTION): HintLevel {
  return Math.max(min, Math.min(max, n)) as HintLevel;
}

function denied(req: PolicyRequest, reason: PolicyDecision["denialReason"]): PolicyDecision {
  return {
    shouldOffer: false,
    denialReason: reason,
    blockType: BlockType.UNKNOWN,
    hintType: HintType.STARTING_POINT,
    hintLevel: HintLevel.L0_NONE,
    strategyTag: "DIRECT_CLUE",
    targetStepId: req.stepId,
    revealsAnswer: false,
    rationale: "",
    maxWords: 0,
  };
}

/** §13, §44 — classify what kind of "stuck" this is from actual signals, not guesswork. */
export function diagnoseBlockType(req: PolicyRequest): BlockType {
  if (req.explicitConfidenceSelfReport === "UNSURE_DESPITE_CORRECT") return BlockType.CONFIDENCE_BLOCK;

  if (!req.attempt) {
    // No submission yet on this step at all.
    return req.attemptCountOnStep === 0 ? BlockType.STARTING_POINT_BLOCK : BlockType.UNKNOWN;
  }

  switch (req.attempt.mistakeSignal) {
    case MistakeSignal.NO_ATTEMPT:
      return req.trigger === TriggerType.EXPLICIT_CONFUSION ? BlockType.CONCEPT_BLOCK : BlockType.STARTING_POINT_BLOCK;
    case MistakeSignal.WRONG_STRATEGY:
      return BlockType.STRATEGY_BLOCK;
    case MistakeSignal.WRONG_FORMULA:
      return BlockType.FORMULA_BLOCK;
    case MistakeSignal.WRONG_REFERENCE_VALUE:
      return BlockType.INPUT_MAPPING_BLOCK;
    case MistakeSignal.CALCULATION_ERROR:
      return BlockType.CALCULATION_BLOCK;
    case MistakeSignal.MISREAD_QUESTION:
      return BlockType.INTERPRETATION_BLOCK;
    case MistakeSignal.UNIT_ERROR:
      return BlockType.VERIFICATION_BLOCK; // hint type is special-cased to UNIT below
    case MistakeSignal.CONCEPT_ERROR:
      return BlockType.CONCEPT_BLOCK;
    case MistakeSignal.GUESS_CORRECT:
      return BlockType.CONFIDENCE_BLOCK; // handled as a special case, not a real "block"
    case MistakeSignal.NONE:
    default:
      return BlockType.UNKNOWN;
  }
}

function buildRationale(blockType: BlockType, req: PolicyRequest): string {
  switch (blockType) {
    case BlockType.STARTING_POINT_BLOCK:
      return "Nothing's been tried on this step yet, so the hint focuses on where to begin.";
    case BlockType.CONCEPT_BLOCK:
      return "The underlying idea looks like the gap, so the hint focuses on that concept.";
    case BlockType.STRATEGY_BLOCK:
      return "The last attempt suggests the approach needs a second look, so this hint focuses on choosing a method.";
    case BlockType.FORMULA_BLOCK:
      return "The approach is close, so this hint focuses on the formula itself.";
    case BlockType.INPUT_MAPPING_BLOCK:
      return "The approach is correct — this hint focuses on which value goes where.";
    case BlockType.CALCULATION_BLOCK:
      return "The approach is correct — this hint focuses on the execution, not the method.";
    case BlockType.INTERPRETATION_BLOCK:
      return "The attempt suggests the question was read differently than intended.";
    case BlockType.VERIFICATION_BLOCK:
      return req.attempt?.mistakeSignal === MistakeSignal.UNIT_ERROR
        ? "Everything upstream is right — this is just a units check."
        : "This hint focuses on checking the result, not redoing the method.";
    case BlockType.CONFIDENCE_BLOCK:
      return "The reasoning already looks correct — this is a confidence check, not new material.";
    default:
      return "Not enough signal yet to target a specific gap, so this starts minimal.";
  }
}

/**
 * The one function everything else calls. Pure, synchronous, no I/O — exactly what §10 asks for.
 */
export function decide(req: PolicyRequest): PolicyDecision {
  // ---- 1. Hard gates (cheap, deterministic, no model call needed — §65) ------------------
  if (req.assessmentMode === AssessmentMode.ASSESSMENT && !req.hintsExplicitlyPermittedInAssessment) {
    return denied(req, "ASSESSMENT_DISABLED"); // §32, §72
  }
  if (req.budget?.maxHints !== undefined && req.priorHintsThisStep.length >= req.budget.maxHints) {
    return denied(req, "BUDGET_EXCEEDED"); // §35–36
  }
  const lastOutcome = req.priorOutcomesThisStep[req.priorOutcomesThisStep.length - 1];
  if (lastOutcome?.result === HintOutcomeResultEnum.SUCCESS) {
    // §98: once the student corrects, give control back — don't keep helping.
    return denied(req, "ALREADY_RESOLVED");
  }

  // ---- 2. Trigger sufficiency (§12, §48: never trigger purely because it's slow) ---------
  if (req.trigger === TriggerType.STUCKNESS || req.trigger === TriggerType.LONG_STALL) {
    const stallRatio = req.medianTimeForStepMs > 0 ? req.timeOnStepMs / req.medianTimeForStepMs : 1;
    const evidenceEnough = stallRatio >= STALL_RATIO_THRESHOLD || req.attemptCountOnStep >= MIN_ATTEMPTS_FOR_STUCKNESS;
    if (!evidenceEnough) return denied(req, "INSUFFICIENT_EVIDENCE");
  }

  // ---- 3. Special cases that bypass the generic path entirely ---------------------------
  if (req.attempt?.mistakeSignal === MistakeSignal.GUESS_CORRECT) {
    // §47 — a correct guess gets a reasoning prompt, not reinforcement via a hint.
    return {
      shouldOffer: false,
      blockType: BlockType.CONFIDENCE_BLOCK,
      hintType: HintType.VERIFICATION,
      hintLevel: HintLevel.L0_NONE,
      strategyTag: "AFFIRMATION",
      targetStepId: req.stepId,
      revealsAnswer: false,
      rationale: "Correct, but the attempt pattern looks like a guess rather than reasoning.",
      maxWords: 0,
      followUp: "ASK_REASONING_FOR_GUESS",
    };
  }

  // ---- 4. Diagnose, map to type, set baseline level --------------------------------------
  const blockType = diagnoseBlockType(req);
  let hintType = BLOCK_TO_HINT_TYPE[blockType];
  let level: HintLevel = BASELINE_LEVEL[blockType];

  // §93 — "I know the formula, I'm just checking the unit" bypasses the generic concept ladder.
  const isUnitCheck = req.attempt?.mistakeSignal === MistakeSignal.UNIT_ERROR || req.explicitConfidenceSelfReport === "CHECKING_UNIT_ONLY";
  if (isUnitCheck) {
    hintType = HintType.UNIT;
    level = HintLevel.L1_DIRECTIONAL;
  }
  // §46 — correct but hesitant gets an affirming nudge, not new material.
  if (blockType === BlockType.CONFIDENCE_BLOCK && !isUnitCheck) {
    hintType = HintType.VERIFICATION;
    level = HintLevel.L1_DIRECTIONAL;
  }

  // ---- 5. Strategy selection + escalation (§19–20, §53, §90) -----------------------------
  // How many times has *this same hint type* already failed on this step? That count walks
  // the strategy sequence forward — repetition earns a new angle, never just louder wording
  // of the same one.
  const failuresThisTypeOnStep = req.priorOutcomesThisStep.filter((outcome, i) => {
    const interaction = req.priorHintsThisStep[i];
    return outcome.result === HintOutcomeResultEnum.NO_EFFECT && interaction?.hintType === hintType;
  }).length;

  const sequence = STRATEGY_SEQUENCE[hintType] ?? DEFAULT_SEQUENCE;
  const strategyIdx = Math.min(failuresThisTypeOnStep, sequence.length - 1);
  const strategyTag: StrategyTag = sequence[strategyIdx];

  // The level ladder and the strategy sequence must agree with each other: "here's this step
  // worked out" (strategyTag === WORKED_STEP) IS the §17 "worked step" rung, by definition, so
  // it always carries L6 and revealsAnswer=true. Anything short of that escalates the level
  // additively but must stay below a reveal — otherwise the generator has no way to know
  // whether the strategy it was told to use is actually authorized to state the value.
  if (strategyTag === "WORKED_STEP") {
    level = HintLevel.L6_WORKED_STEP;
  } else {
    const streakEscalation = req.sameErrorStreak >= 3 ? 1 : 0;
    level = clampLevel(level + Math.max(failuresThisTypeOnStep, streakEscalation), HintLevel.L0_NONE, HintLevel.L5_STEP_GUIDANCE);

    // ---- 6. Dependency-aware starting offset (§37, §39–40) -------------------------------
    // HIGH dependency nudges the *starting* level up a notch to reduce needless frustration;
    // LOW nudges it down (fading). Never applied once we've already reached the worked-step
    // rung above, so it can't accidentally push past what the strategy sequence authorized.
    if (req.dependencyState === DependencyState.HIGH) level = clampLevel(level + 1, HintLevel.L0_NONE, HintLevel.L5_STEP_GUIDANCE);
    if (req.dependencyState === DependencyState.LOW) level = clampLevel(level - 1, HintLevel.L1_DIRECTIONAL, HintLevel.L5_STEP_GUIDANCE);
  }

  // ---- 7. Budget cap (§35–36) — L7 (complete solution) requires an explicit ask; L6 (this
  // step, worked out) is the natural ceiling of ordinary escalation. ----------------------
  const maxAllowed = req.budget?.maxLevel ?? (req.requestFullSolution ? HintLevel.L7_COMPLETE_SOLUTION : HintLevel.L6_WORKED_STEP);
  level = clampLevel(Math.min(level, maxAllowed));

  const revealsAnswer = level >= HintLevel.L6_WORKED_STEP;

  return {
    shouldOffer: true,
    blockType,
    hintType,
    hintLevel: level,
    strategyTag,
    targetStepId: req.stepId,
    revealsAnswer,
    rationale: buildRationale(blockType, req),
    maxWords: MAX_WORDS_BY_LEVEL[level],
  };
}

/** Small helper the API layer and tests use to build the next AttemptSnapshot's mistake context. */
export function isBlocking(signal: MistakeSignal): boolean {
  return signal !== MistakeSignal.NONE;
}
export type { AttemptSnapshot };
