import { THRESHOLDS } from "../config/thresholds";
import { getLatestSnapshot } from "./readinessService";

export interface SkillGap {
  category: string;
  currentScore: number;
  target: number;
  gap: number;
  evidenceCount: number;
}

/**
 * Gaps are derived only from categories that actually have evidence.
 * Categories with no measurements are surfaced separately as
 * `noDataCategories`, never silently treated as a 0/max gap (spec §57).
 */
export async function getSkillGaps(studentId: string, targetsByCategory: Record<string, number> = {}) {
  const snapshot = await getLatestSnapshot(studentId);
  if (!snapshot || snapshot.overallScore === null) {
    return { hasData: false as const, gaps: [] as SkillGap[], noDataCategories: [] as string[] };
  }

  const gaps: SkillGap[] = [];
  const noDataCategories: string[] = [];

  for (const [category, data] of Object.entries(snapshot.categoryScores as Record<string, { score: number; evidenceCount: number } | null>)) {
    if (!data) {
      noDataCategories.push(category);
      continue;
    }
    const target = targetsByCategory[category] ?? THRESHOLDS.DEFAULT_CATEGORY_TARGET;
    const gap = Math.round((target - data.score) * 10) / 10;
    if (gap > 0) {
      gaps.push({ category, currentScore: data.score, target, gap, evidenceCount: data.evidenceCount });
    }
  }

  gaps.sort((a, b) => b.gap - a.gap);

  return { hasData: true as const, gaps, noDataCategories, snapshotAt: snapshot.calculatedAt };
}

export function largestGap(gaps: SkillGap[]): SkillGap | null {
  return gaps.length > 0 ? gaps[0] : null;
}
