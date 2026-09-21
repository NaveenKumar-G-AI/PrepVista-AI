import { getStagesForStudent, listEvidenceForStudent } from '../db/repository';
import { PATTERN_THRESHOLDS } from '../constants';
import type { FailureCategory, PatternStrength, StageKey, StageStatus } from '../types';

function strengthFromCount(n: number): PatternStrength | 'none' {
  if (n <= 0) return 'none';
  if (n <= PATTERN_THRESHOLDS.limited) return 'limited_evidence';
  if (n <= PATTERN_THRESHOLDS.emerging) return 'emerging_pattern';
  return 'repeated_pattern';
}

export interface StagePatternResult {
  stageKey: StageKey;
  count: number;
  strength: PatternStrength | 'none';
  dominantCategory: FailureCategory | null;
}

export interface PatternStageEntry {
  stageId: string;
  opportunityId: string;
  opportunityCreatedAt: string;
  stageKey: StageKey;
  status: StageStatus;
  isFurthest: boolean;
}

export interface PatternEvidenceEntry {
  applicationStageId: string | null;
  failureCategory: FailureCategory | null;
}

// Pure computation (Section 33/11) — takes plain data in, so it is directly
// unit-testable. This computes a REPEATED SIGNAL only, never a root cause.
export function computeStagePattern(
  entries: PatternStageEntry[],
  evidenceEntries: PatternEvidenceEntry[],
  targetStageKey: StageKey,
  excludeOpportunityId: string,
  windowSize = 15,
): StagePatternResult {
  const others = entries.filter((s) => s.opportunityId !== excludeOpportunityId);

  const recentOppIds = Array.from(new Set(others.map((s) => s.opportunityId)))
    .map((id) => ({ id, createdAt: others.find((s) => s.opportunityId === id)!.opportunityCreatedAt }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, windowSize)
    .map((x) => x.id);

  const recentSet = new Set(recentOppIds);
  const matches = others.filter(
    (s) =>
      recentSet.has(s.opportunityId) &&
      s.stageKey === targetStageKey &&
      s.isFurthest &&
      (s.status === 'rejected' || s.status === 'withdrawn'),
  );

  const count = matches.length;
  let dominantCategory: FailureCategory | null = null;

  if (count > 0) {
    const tally = new Map<FailureCategory, number>();
    for (const m of matches) {
      const ev = evidenceEntries.find((e) => e.applicationStageId === m.stageId && e.failureCategory);
      if (ev?.failureCategory) {
        tally.set(ev.failureCategory, (tally.get(ev.failureCategory) ?? 0) + 1);
      }
    }
    let best: [FailureCategory, number] | null = null;
    for (const entry of tally) {
      if (!best || entry[1] > best[1]) best = entry;
    }
    dominantCategory = best?.[0] ?? null;
  }

  return { stageKey: targetStageKey, count, strength: strengthFromCount(count), dominantCategory };
}

export function detectStagePattern(
  studentId: string,
  targetStageKey: StageKey,
  excludeOpportunityId: string,
  windowSize = 15,
): StagePatternResult {
  const stageRows = getStagesForStudent(studentId);
  const entries: PatternStageEntry[] = stageRows.map((s) => ({
    stageId: s.id,
    opportunityId: s.opportunityId,
    opportunityCreatedAt: s.opportunity.createdAt,
    stageKey: s.stageKey,
    status: s.status,
    isFurthest: s.isFurthest,
  }));
  const evidence = listEvidenceForStudent(studentId).map((e) => ({
    applicationStageId: e.applicationStageId,
    failureCategory: e.failureCategory,
  }));
  return computeStagePattern(entries, evidence, targetStageKey, excludeOpportunityId, windowSize);
}
