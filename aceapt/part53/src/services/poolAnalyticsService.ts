import { QuestionVersion } from '../types/domain.js';

/**
 * Section 31: "Over a large item pool: monitor A/B/C/D. Do not create obvious patterns.
 * Question-level correctness is still primary; position balance is a pool-quality concern."
 * This is deliberately NOT a per-question validator — a single question having its answer in
 * slot B is meaningless; only the pool-wide distribution matters.
 */
export function computeAnswerPositionDistribution(versions: QuestionVersion[]): {
  distribution: Record<number, number>;
  balanced: boolean;
} {
  const distribution: Record<number, number> = {};
  let counted = 0;

  for (const v of versions) {
    if (!v.answerKey || v.answerKey.length !== 1 || v.multiSelect) continue; // position bias only applies to single-select
    const index = v.options?.findIndex((o) => o.id === v.answerKey[0]);
    if (index === undefined || index < 0) continue;
    distribution[index] = (distribution[index] ?? 0) + 1;
    counted++;
  }

  const maxShare = counted === 0 ? 0 : Math.max(...Object.values(distribution)) / counted;
  return { distribution, balanced: counted < 8 || maxShare <= 0.4 };
}

/**
 * Section 92: curriculum coverage gaps — e.g. plenty of "basic probability" items but none on
 * conditional probability. `minCount` is the threshold below which a subskill is flagged as a
 * coverage gap worth content-team attention (not a per-question defect).
 */
export function computeCurriculumCoverage(
  versions: QuestionVersion[],
  minCount = 5,
): { skill: string; subskill: string; count: number; gap: boolean }[] {
  const counts = new Map<string, number>();
  for (const v of versions) {
    const skill = v.skillMapping?.primarySkill ?? 'UNTAGGED';
    const subskill = v.skillMapping?.subskill ?? 'GENERAL';
    const key = `${skill}::${subskill}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([key, count]) => {
    const [skill, subskill] = key.split('::');
    return { skill, subskill, count, gap: count < minCount };
  });
}
