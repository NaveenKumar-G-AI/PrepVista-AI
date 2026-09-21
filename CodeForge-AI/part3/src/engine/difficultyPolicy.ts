/**
 * CodeForge — Adaptive Difficulty Policy (§13, §14)
 *
 * "This must be implemented as a policy engine rather than hidden entirely
 * inside an LLM" — every branch below is an explicit, inspectable rule keyed
 * off real signals from the attempt sequence (final pass/fail, hints used,
 * how strong the very first submission was). Nothing here calls an AI
 * provider; qualitative AI coaching is a separate, additive layer
 * (src/evaluation/evaluationService.ts) that never feeds back into this
 * decision.
 */

import { DIFFICULTY_LABEL_ORDER, DifficultyLabel, SkillLevel } from "../domain/types.js";

export interface ChallengeOutcomeSignal {
  finalStatus: "PASSED" | "FAILED" | "ABANDONED";
  totalHintsUsed: number;
  submissionCount: number;
  /** testsPassed / testsTotal on the very first submission — signals how close the initial attempt was. */
  firstAttemptPassRatio: number;
}

export type PolicyDecision =
  | "STRONG_SUCCESS"
  | "NORMAL_SUCCESS"
  | "SUCCESS_WITH_HEAVY_HINTS"
  | "FAILURE"
  | "REPEATED_FAILURE"
  | "REPEATED_STRONG_SUCCESS";

const HEAVY_HINT_THRESHOLD = 3;

export function classifyOutcome(current: ChallengeOutcomeSignal, recentSameSkill: ChallengeOutcomeSignal[]): PolicyDecision {
  if (current.finalStatus !== "PASSED") {
    const priorFailuresInARow = recentSameSkill.slice(0, 2).filter((o) => o.finalStatus !== "PASSED").length;
    return priorFailuresInARow >= 1 ? "REPEATED_FAILURE" : "FAILURE";
  }

  if (current.totalHintsUsed === 0 && current.submissionCount === 1) {
    const priorTwoStrong = recentSameSkill.slice(0, 2).length === 2 && recentSameSkill.slice(0, 2).every((o) => o.finalStatus === "PASSED" && o.totalHintsUsed === 0);
    return priorTwoStrong ? "REPEATED_STRONG_SUCCESS" : "STRONG_SUCCESS";
  }

  if (current.totalHintsUsed >= HEAVY_HINT_THRESHOLD) return "SUCCESS_WITH_HEAVY_HINTS";

  return "NORMAL_SUCCESS";
}

export interface DifficultyDecision {
  label: DifficultyLabel;
  delta: number;
  decision: PolicyDecision;
  reason: string;
}

export function nextDifficulty(
  currentLabel: DifficultyLabel,
  signal: ChallengeOutcomeSignal,
  recentSameSkill: ChallengeOutcomeSignal[],
): DifficultyDecision {
  const decision = classifyOutcome(signal, recentSameSkill);
  const idx = DIFFICULTY_LABEL_ORDER.indexOf(currentLabel);
  let delta: number;
  let reason: string;

  switch (decision) {
    case "REPEATED_STRONG_SUCCESS":
      delta = 2;
      reason = "Repeated strong, hint-free performance at this level — moving toward a more advanced application (§13).";
      break;
    case "STRONG_SUCCESS":
      delta = 1;
      reason = "Strong, hint-free success — increasing difficulty.";
      break;
    case "NORMAL_SUCCESS":
      // A first attempt that was already mostly correct earns a bump even though it took a hint
      // or a retry to close out — that's a strong signal, not just a pass. A first attempt that
      // was mostly wrong earns lateral movement instead, to consolidate before going up.
      delta = signal.firstAttemptPassRatio >= 0.7 ? 1 : 0;
      reason =
        signal.firstAttemptPassRatio >= 0.7
          ? `Handled the core scenario correctly on the first submission (${Math.round(signal.firstAttemptPassRatio * 100)}% of tests) and closed the remaining gap quickly — a modest difficulty increase is warranted.`
          : "Reached a correct solution, but needed real support along the way — moving laterally into a new context to consolidate before going up.";
      break;
    case "SUCCESS_WITH_HEAVY_HINTS":
      delta = 0;
      reason = "Passed, but leaned heavily on hints — offering related reinforcement at the same level next, per §14.";
      break;
    case "FAILURE":
      delta = 0;
      reason = "Did not pass. The specific mistake evidence (not difficulty alone) determines whether the next challenge reinforces the same subskill or steps back toward a prerequisite.";
      break;
    case "REPEATED_FAILURE":
      delta = -1;
      reason = "Repeated failure on this skill — stepping back to reinforce a prerequisite before returning to this level.";
      break;
  }

  const nextIdx = Math.min(DIFFICULTY_LABEL_ORDER.length - 1, Math.max(0, idx + delta));
  return { label: DIFFICULTY_LABEL_ORDER[nextIdx]!, delta, decision, reason };
}

/** Starting point for a skill with no attempt history yet — derived from the evidence-based SkillLevel. */
export function startingDifficultyForLevel(level: SkillLevel): DifficultyLabel {
  switch (level) {
    case SkillLevel.WEAK:
      return DifficultyLabel.FOUNDATION;
    case SkillLevel.DEVELOPING:
      return DifficultyLabel.EASY;
    case SkillLevel.PROFICIENT:
      return DifficultyLabel.INTERMEDIATE;
    case SkillLevel.STRONG:
      return DifficultyLabel.ADVANCED;
  }
}
