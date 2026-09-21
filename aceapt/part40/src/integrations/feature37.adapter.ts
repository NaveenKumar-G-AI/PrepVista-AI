import { PoolClient } from 'pg';
import * as standins from '../db/standins';

/**
 * Feature 37 provides validated capability evidence (spec ??52). Feature 40
 * compares future market requirements against THIS data -- it never scores or
 * verifies evidence itself; that judgment belongs to Feature 37.
 *
 * TO INTEGRATE: replace getEvidenceMap's body with a call into the real
 * Feature 37 evidence service. Keep the returned Map<skillSlug, EvidenceSummary>
 * shape -- src/services/futureGap.service.ts is built against it.
 */

export interface EvidenceSummary {
  skillId: string;
  skillName: string;
  skillSlug: string;
  strength: number; // 0..1, the strongest single piece of evidence for this skill
  itemCount: number;
  verifiedCount: number;
  mostRecent: Date;
}

export async function getEvidenceMap(client: PoolClient, studentId: string): Promise<Map<string, EvidenceSummary>> {
  const items = await standins.getEvidenceForStudent(client, studentId);
  const map = new Map<string, EvidenceSummary>();
  for (const item of items) {
    const existing = map.get(item.skillSlug);
    if (!existing) {
      map.set(item.skillSlug, {
        skillId: item.skillId,
        skillName: item.skillName,
        skillSlug: item.skillSlug,
        strength: item.strength,
        itemCount: 1,
        verifiedCount: item.verified ? 1 : 0,
        mostRecent: item.createdAt,
      });
    } else {
      existing.strength = Math.max(existing.strength, item.strength);
      existing.itemCount += 1;
      existing.verifiedCount += item.verified ? 1 : 0;
      if (item.createdAt > existing.mostRecent) existing.mostRecent = item.createdAt;
    }
  }
  return map;
}

export function describeEvidence(summary: EvidenceSummary | undefined): string {
  if (!summary) return 'no demonstrable evidence on file yet';
  if (summary.verifiedCount === 0) {
    return `${summary.itemCount} unverified item${summary.itemCount === 1 ? '' : 's'} on file`;
  }
  return `${summary.verifiedCount} verified item${summary.verifiedCount === 1 ? '' : 's'} (evidence strength ${(summary.strength * 100).toFixed(0)}%)`;
}
