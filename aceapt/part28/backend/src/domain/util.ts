import type { NoveltyLevel, DifficultyLevel } from './types.js';

export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

const NOVELTY_RANK: Record<NoveltyLevel, number> = {
  FAMILIAR: 0,
  RELATED: 1,
  NOVEL: 2,
  HIGHLY_NOVEL: 3,
};
export function noveltyRank(level: NoveltyLevel): number {
  return NOVELTY_RANK[level];
}
export function noveltyAtLeast(level: NoveltyLevel, min: NoveltyLevel): boolean {
  return noveltyRank(level) >= noveltyRank(min);
}

const DIFFICULTY_RANK: Record<DifficultyLevel, number> = {
  EASY: 0,
  MEDIUM: 1,
  HARD: 2,
  TARGET: 3,
};
export function difficultyRank(level: DifficultyLevel): number {
  return DIFFICULTY_RANK[level];
}

export function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function stddev(nums: number[]): number {
  if (nums.length < 2) return 0;
  const m = mean(nums);
  const variance = mean(nums.map((n) => (n - m) ** 2));
  return Math.sqrt(variance);
}

export function weightedMean(items: { value: number; weight: number }[]): number {
  const totalWeight = items.reduce((s, i) => s + i.weight, 0);
  if (totalWeight === 0) return 0;
  return items.reduce((s, i) => s + i.value * i.weight, 0) / totalWeight;
}
