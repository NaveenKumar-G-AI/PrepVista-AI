import type { ErrorType, InterventionType } from "../types/errorTaxonomy.js";
import type { RecurrenceStatus } from "../types/errorTaxonomy.js";
import type { Difficulty } from "../types/training.js";
import type { StabilityResult } from "../domain/stability.js";
import { getInterventionType } from "./interventionMapping.js";
import {
  nextRepairStage,
  nextDifficulty,
  shouldFadeToMixedPrecision,
  type RepairStage,
  type DifficultyAdjustment
} from "./repairLadder.js";

export interface PolicyInput {
  errorType: ErrorType | null;
  recurrenceStatus: RecurrenceStatus | null;
  currentDifficulty: Difficulty;
  lastAttemptCorrect: boolean | null;
  recentCorrectStreak: number;
  currentRepairStage: RepairStage | null;
  consecutiveCorrectAtCurrentStage: number;
  stability: StabilityResult;
  targetAccuracyPct: number;
}

export interface PolicyDecision {
  interventionType: InterventionType | null;
  repairStage: RepairStage;
  difficulty: Difficulty;
  difficultyAdjustment: DifficultyAdjustment;
  shouldFadeToMixedPrecision: boolean;
  shouldReassess: boolean;
  priorityRaised: boolean; // §119 — recurring error → priority rises
  rationale: string;
}

/**
 * §42 — "select intervention, determine difficulty, select question type,
 * control pressure, choose repetition, determine when to switch, determine
 * when to fade, determine when to reassess." One pure function, fully
 * testable without a DB or an AI call — see tests/unit/policyEngine.test.ts.
 */
export function decidePolicy(input: PolicyInput): PolicyDecision {
  const interventionType = input.errorType ? getInterventionType(input.errorType) : null;

  const repairStage = nextRepairStage(
    input.currentRepairStage,
    input.lastAttemptCorrect ?? true,
    input.consecutiveCorrectAtCurrentStage
  );

  const { adjustment: difficultyAdjustment, next: difficulty } = nextDifficulty(
    input.currentDifficulty,
    input.recentCorrectStreak,
    input.lastAttemptCorrect === false
  );

  const fade =
    input.recurrenceStatus === "resolved" &&
    shouldFadeToMixedPrecision(input.stability, input.targetAccuracyPct);

  // §52/§121 — a regression sends the student back toward investigation
  // rather than straight back into a drill, matching the spec's own
  // "maintenance → investigation" framing.
  const shouldReassess = input.recurrenceStatus === "regressed";

  // §119 — "Same mistake appears three times. Expected: priority rises."
  const priorityRaised = input.recurrenceStatus === "recurring" || input.recurrenceStatus === "clustered";

  return {
    interventionType,
    repairStage,
    difficulty,
    difficultyAdjustment,
    shouldFadeToMixedPrecision: fade,
    shouldReassess,
    priorityRaised,
    rationale: buildRationale(input, interventionType)
  };
}

/** §69 — every recommendation should answer "WHY am I practicing this?" */
function buildRationale(input: PolicyInput, interventionType: InterventionType | null): string {
  if (input.recurrenceStatus === "regressed") {
    return "This error pattern was resolved before and has reappeared recently — a short review is worth doing before continuing.";
  }
  if (input.recurrenceStatus === "resolved") {
    return "This error pattern shows sufficient independent evidence of resolution — precision practice can broaden into mixed review.";
  }
  if (!interventionType || !input.errorType) {
    return "Continuing precision practice at the current focus.";
  }
  const recurrenceNote =
    input.recurrenceStatus === "recurring" || input.recurrenceStatus === "clustered"
      ? " This is the type of error that has appeared most often in recent attempts."
      : "";
  return `This drill targets ${humanizeErrorType(input.errorType)}.${recurrenceNote}`;
}

function humanizeErrorType(errorType: ErrorType): string {
  return errorType.replace(/_/g, " ").toLowerCase();
}
