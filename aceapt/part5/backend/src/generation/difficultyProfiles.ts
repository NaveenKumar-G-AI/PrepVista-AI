import { Difficulty } from "../domain/enums";
import { DifficultyProfile } from "../domain/types";

type Dim = 1 | 2 | 3 | 4 | 5;

const BASE: Record<Difficulty, Omit<DifficultyProfile, "level">> = {
  [Difficulty.FOUNDATION]: { conceptComplexity: 1, reasoningComplexity: 1, calculationComplexity: 1, timePressure: 1, distractorQuality: 1, transferDifficulty: 1 },
  [Difficulty.EASY]: { conceptComplexity: 2, reasoningComplexity: 1, calculationComplexity: 1, timePressure: 1, distractorQuality: 2, transferDifficulty: 1 },
  [Difficulty.EASY_PLUS]: { conceptComplexity: 2, reasoningComplexity: 2, calculationComplexity: 2, timePressure: 2, distractorQuality: 2, transferDifficulty: 1 },
  [Difficulty.MEDIUM]: { conceptComplexity: 3, reasoningComplexity: 2, calculationComplexity: 2, timePressure: 2, distractorQuality: 3, transferDifficulty: 2 },
  [Difficulty.MEDIUM_PLUS]: { conceptComplexity: 3, reasoningComplexity: 3, calculationComplexity: 3, timePressure: 3, distractorQuality: 3, transferDifficulty: 2 },
  [Difficulty.HARD]: { conceptComplexity: 4, reasoningComplexity: 3, calculationComplexity: 4, timePressure: 3, distractorQuality: 4, transferDifficulty: 3 },
  [Difficulty.HARD_PLUS]: { conceptComplexity: 4, reasoningComplexity: 4, calculationComplexity: 4, timePressure: 4, distractorQuality: 4, transferDifficulty: 4 },
  [Difficulty.EXPERT]: { conceptComplexity: 5, reasoningComplexity: 5, calculationComplexity: 5, timePressure: 5, distractorQuality: 5, transferDifficulty: 5 },
};

const TIME_BY_LEVEL: Record<Difficulty, number> = {
  [Difficulty.FOUNDATION]: 30,
  [Difficulty.EASY]: 35,
  [Difficulty.EASY_PLUS]: 42,
  [Difficulty.MEDIUM]: 50,
  [Difficulty.MEDIUM_PLUS]: 60,
  [Difficulty.HARD]: 75,
  [Difficulty.HARD_PLUS]: 90,
  [Difficulty.EXPERT]: 110,
};

export function baseDifficultyProfile(level: Difficulty, overrides: Partial<Record<keyof Omit<DifficultyProfile, "level">, Dim>> = {}): DifficultyProfile {
  return { level, ...BASE[level], ...overrides };
}

export function baseExpectedTimeSeconds(level: Difficulty, extraSeconds = 0): number {
  return TIME_BY_LEVEL[level] + extraSeconds;
}
