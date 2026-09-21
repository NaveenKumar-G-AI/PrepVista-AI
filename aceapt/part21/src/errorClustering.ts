// ============================================================
// ERROR CLUSTERING (spec §10, §11)
//
// Groups wrong attempts by their error-pattern tag so twelve
// scary-looking mistakes can be shown as "mainly 3 recurring
// patterns" instead of twelve undifferentiated red marks.
// ============================================================

import { AttemptEvidence, ErrorCluster } from './types';

export function clusterErrors(attempts: AttemptEvidence[]): ErrorCluster[] {
  const wrong = attempts.filter((a) => !a.isCorrect);
  const byTag = new Map<string, AttemptEvidence[]>();
  for (const attempt of wrong) {
    const tag = attempt.errorPatternTag ?? 'untagged';
    const list = byTag.get(tag);
    if (list) list.push(attempt);
    else byTag.set(tag, [attempt]);
  }
  const clusters: ErrorCluster[] = [...byTag.entries()].map(([patternTag, items]) => ({
    patternTag,
    count: items.length,
    exampleSkillIds: [...new Set(items.map((i) => i.skillId))],
  }));
  return clusters.sort((a, b) => b.count - a.count);
}

/** The fraction of wrong attempts explained by the single largest cluster. */
export function dominantClusterShare(clusters: ErrorCluster[], totalWrong: number): number {
  if (totalWrong === 0 || clusters.length === 0) return 0;
  return clusters[0].count / totalWrong;
}
