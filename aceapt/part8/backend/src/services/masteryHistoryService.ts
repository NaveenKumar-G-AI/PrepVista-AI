import type { PoolClient } from "pg";
import { listHistoryForSkill } from "../repositories/masteryHistoryRepository.js";
import { listEvidenceForSkill } from "../repositories/masteryEvidenceRepository.js";
import type { MasteryHistoryEvent } from "../types/index.js";

export interface BeforeAfterEvidence {
  before: { accuracy: number | null; transferAccuracy: number | null; timedAccuracy: number | null; capturedAt: string | null };
  after: { accuracy: number | null; transferAccuracy: number | null; timedAccuracy: number | null; capturedAt: string | null };
}

export async function getHistoryTimeline(client: PoolClient, studentId: string, skillId: string): Promise<MasteryHistoryEvent[]> {
  return listHistoryForSkill(client, studentId, skillId);
}

/**
 * Spec section 39: show meaningful improvement, not just a bigger number.
 * "Before" is the earliest third of recorded evidence, "after" is the most
 * recent third - both computed from real stored evidence, never invented.
 * Returns nulls for a dimension with no evidence in that window rather than
 * a misleading 0.
 */
export async function getBeforeAfterEvidence(client: PoolClient, studentId: string, skillId: string): Promise<BeforeAfterEvidence | null> {
  const evidence = await listEvidenceForSkill(client, studentId, skillId);
  const usable = evidence.filter((e) => e.questionExposureState !== "MEMORIZATION_RISK");
  if (usable.length < 4) return null;

  const windowSize = Math.max(2, Math.floor(usable.length / 3));
  const before = usable.slice(0, windowSize);
  const after = usable.slice(-windowSize);

  const avg = (items: typeof usable, pred: (e: (typeof usable)[number]) => boolean) => {
    const filtered = items.filter(pred);
    if (filtered.length === 0) return null;
    return Math.round((filtered.reduce((s, e) => s + e.score, 0) / filtered.length) * 1000) / 1000;
  };

  const isTransfer = (e: (typeof usable)[number]) => e.noveltyLevel === "NOVEL" || e.noveltyLevel === "COMPLEX_APPLICATION";
  const isTimed = (e: (typeof usable)[number]) => e.timed;

  return {
    before: {
      accuracy: avg(before, () => true),
      transferAccuracy: avg(before, isTransfer),
      timedAccuracy: avg(before, isTimed),
      capturedAt: before[0]?.createdAt ?? null,
    },
    after: {
      accuracy: avg(after, () => true),
      transferAccuracy: avg(after, isTransfer),
      timedAccuracy: avg(after, isTimed),
      capturedAt: after[after.length - 1]?.createdAt ?? null,
    },
  };
}
