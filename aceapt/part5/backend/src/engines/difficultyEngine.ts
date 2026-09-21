import { Attempt } from "../domain/types";
import { Difficulty, DifficultyDimension, ErrorCategory, RelativeSpeed } from "../domain/enums";

export interface DifficultyDecision {
  nextDifficulty: Difficulty;
  delta: number;
  focusDimension?: DifficultyDimension;
  questionTypeBias?: string[];
  rationale: string;
  triggeredAdaptation: boolean;
}

const MIN = Difficulty.FOUNDATION;
const MAX = Difficulty.EXPERT;

function clamp(level: number): Difficulty {
  return Math.max(MIN, Math.min(MAX, level)) as Difficulty;
}

/**
 * Decide the next difficulty given the attempt that just happened and the
 * short recent history for that skill (oldest → newest, NOT including the
 * current attempt).
 *
 * This is deliberately NOT "correct → harder, wrong → easier" (§10). The
 * error category on a wrong answer determines both how far difficulty moves
 * and what the next question should be biased toward:
 *
 *   Medium (correct, fast) → step up to Medium+
 *   Medium+ (correct, fast) → step up to Hard
 *   Hard (wrong, CALCULATION_ERROR) → step down ONE tier to Medium+,
 *     biased toward calculation-heavy questions — NOT a crash to Easy,
 *     because a calculation slip is not evidence the underlying concept
 *     is shaky.
 *
 * A CONCEPT_GAP miss on the other hand steps down two tiers and biases
 * toward CONCEPT_CHECK/GUIDED_PRACTICE, because the evidence there really
 * does say the foundation needs rebuilding.
 */
export function decideNextDifficulty(
  current: Difficulty,
  latest: Attempt,
  recentHistory: Attempt[]
): DifficultyDecision {
  const consecutiveFastCorrect = countTrailing(
    [...recentHistory, latest],
    (a) => a.isCorrect && a.relativeSpeed === RelativeSpeed.FAST
  );
  const consecutiveCorrect = countTrailing([...recentHistory, latest], (a) => a.isCorrect);
  const consecutiveSameError = countTrailing(
    [...recentHistory, latest],
    (a) => !a.isCorrect && a.errorCategory === latest.errorCategory
  );

  if (latest.isCorrect) {
    if (latest.relativeSpeed === RelativeSpeed.FAST) {
      const delta = consecutiveFastCorrect >= 3 ? 2 : 1;
      return {
        nextDifficulty: clamp(current + delta),
        delta,
        rationale:
          delta === 2
            ? "Three or more fast, correct answers in a row — accelerating difficulty."
            : "Correct and fast — this level is comfortable, stepping up.",
        triggeredAdaptation: delta >= 1,
      };
    }
    if (latest.relativeSpeed === RelativeSpeed.ON_PACE) {
      const delta = consecutiveCorrect >= 2 ? 1 : 0;
      return {
        nextDifficulty: clamp(current + delta),
        delta,
        rationale:
          delta === 1
            ? "Consistent correct answers at a steady pace — stepping up."
            : "Correct at a steady pace — holding difficulty to confirm consistency first.",
        triggeredAdaptation: delta >= 1,
      };
    }
    // Correct but slow.
    return {
      nextDifficulty: current,
      delta: 0,
      focusDimension: DifficultyDimension.TIME_PRESSURE,
      questionTypeBias: ["SPEED"],
      rationale: "Correct, but slower than expected — understanding looks solid, fluency doesn't yet. Holding difficulty, building speed.",
      triggeredAdaptation: false,
    };
  }

  // Incorrect. The error category is what prevents a blanket "wrong = easier".
  switch (latest.errorCategory) {
    case ErrorCategory.CALCULATION_ERROR:
    case ErrorCategory.CARELESS_ERROR: {
      const delta = -1;
      return {
        nextDifficulty: clamp(current + delta),
        delta,
        focusDimension: DifficultyDimension.CALCULATION,
        rationale:
          "Concept understanding appears strong, but a calculation slip affected the result — easing difficulty only slightly, with a calculation-focused question next.",
        triggeredAdaptation: true,
      };
    }
    case ErrorCategory.CONCEPT_GAP:
    case ErrorCategory.PARTIAL_UNDERSTANDING: {
      const delta = consecutiveSameError >= 2 ? -3 : -2;
      return {
        nextDifficulty: clamp(current + delta),
        delta,
        focusDimension: DifficultyDimension.CONCEPT,
        questionTypeBias: ["CONCEPT_CHECK", "GUIDED_PRACTICE"],
        rationale:
          consecutiveSameError >= 2
            ? "Repeated concept gaps on this skill — dropping back to rebuild the foundation before returning to this level."
            : "This miss points to a concept gap rather than a slip — stepping back to reinforce the underlying idea.",
        triggeredAdaptation: true,
      };
    }
    case ErrorCategory.PROCEDURAL_ERROR: {
      const delta = -1;
      return {
        nextDifficulty: clamp(current + delta),
        delta,
        focusDimension: DifficultyDimension.REASONING,
        questionTypeBias: ["GUIDED_PRACTICE"],
        rationale: "The method broke down partway through — next question walks through the same steps at a slightly gentler level.",
        triggeredAdaptation: true,
      };
    }
    case ErrorCategory.MISREAD: {
      return {
        nextDifficulty: current,
        delta: 0,
        rationale: "This looks like a misread rather than a knowledge gap — holding difficulty, flagging careful reading.",
        triggeredAdaptation: false,
      };
    }
    case ErrorCategory.TIME_PRESSURE: {
      const delta = -1;
      return {
        nextDifficulty: clamp(current + delta),
        delta,
        focusDimension: DifficultyDimension.TIME_PRESSURE,
        rationale: "The time limit looks like the real constraint here, not the difficulty — easing off and relaxing pace.",
        triggeredAdaptation: true,
      };
    }
    case ErrorCategory.GUESS: {
      const delta = -1;
      return {
        nextDifficulty: clamp(current + delta),
        delta,
        focusDimension: DifficultyDimension.CONCEPT,
        rationale: "Response pattern looks like a guess — stepping back to check whether the underlying idea is there.",
        triggeredAdaptation: true,
      };
    }
    case ErrorCategory.LOGICAL_ERROR: {
      const delta = -1;
      return {
        nextDifficulty: clamp(current + delta),
        delta,
        focusDimension: DifficultyDimension.REASONING,
        rationale: "The reasoning chain broke at one step — easing difficulty and focusing on that reasoning pattern.",
        triggeredAdaptation: true,
      };
    }
    default: {
      const delta = -1;
      return {
        nextDifficulty: clamp(current + delta),
        delta,
        rationale: "Incorrect answer without a clear error signal — easing difficulty one step as a safe default.",
        triggeredAdaptation: true,
      };
    }
  }
}

function countTrailing<T>(arr: T[], predicate: (item: T) => boolean): number {
  let count = 0;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (predicate(arr[i])) count++;
    else break;
  }
  return count;
}
