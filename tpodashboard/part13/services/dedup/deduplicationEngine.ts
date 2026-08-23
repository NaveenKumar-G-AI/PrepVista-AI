// services/dedup/deduplicationEngine.ts
//
// Section 15 — the single most important rule in this module: the same
// underlying problem must never fan out into repeated signals. One
// signal, updated in place, for as long as the condition persists.
//
// This file also owns the priority calculation for a commit, not just
// the dedup lookup — on purpose. If priority were computed BEFORE the
// dedup lookup (from the registry default alone), a fresh detection
// cycle could silently undo an escalation that already fired (e.g. an
// escalation sweep bumped a signal to CRITICAL two hours ago; the next
// scheduled detection run recomputes from the registry's MEDIUM default
// and would revert it). Computing priority here, against
// max(existingSeverity, freshBaseSeverity), keeps escalation (time-driven)
// and dedup refresh (evidence-driven) both strictly forward-only while a
// signal stays open — matching "every persistent issue must be able to
// escalate" without a hidden downgrade path.

import type { Actionability, ProactiveSignal, SignalCandidate, Severity } from '../signals/types';
import { maxSeverity } from '../signals/types';
import type { SignalRepository } from '../signals/repository';
import { calculatePriority } from '../priority/priorityEngine';

export function buildDedupKey(
  candidate: Pick<SignalCandidate, 'institutionId' | 'seasonId' | 'signalType' | 'entityType' | 'entityId'>,
): string {
  return [candidate.institutionId, candidate.seasonId, candidate.signalType, candidate.entityType, candidate.entityId].join(
    '::',
  );
}

export interface RegistryDefaults {
  severity: Severity;
  actionability: Actionability;
}

export interface UpsertResult {
  signal: ProactiveSignal;
  wasNew: boolean;
  affectedCountChanged: boolean;
}

/** Looks for an open signal with the same dedup key. If found, merges new
 * evidence into it (updates last_updated_at, appends an update-history
 * entry, tracks affected-count movement, recomputes priority) instead of
 * creating a duplicate. Only creates a new record when no open signal
 * shares the key. */
export async function upsertSignal(
  repository: SignalRepository,
  candidate: SignalCandidate,
  registryDefaults: RegistryDefaults,
  now: () => string = () => new Date().toISOString(),
): Promise<UpsertResult> {
  const dedupKey = buildDedupKey(candidate);
  const existing = await repository.findOpenByDedupKey(candidate.institutionId, dedupKey);

  const effectiveBaseSeverity = existing
    ? maxSeverity(existing.severity, candidate.baseSeverity ?? registryDefaults.severity)
    : candidate.baseSeverity ?? registryDefaults.severity;

  const priority = calculatePriority({
    baseSeverity: effectiveBaseSeverity,
    hoursUntilDeadline: candidate.hoursUntilDeadline ?? null,
    studentsAffected: candidate.studentsAffected ?? 0,
    confidence: candidate.confidence,
    institutionalSignificance: candidate.institutionalSignificance,
  });

  const nowIso = now();
  const expiresAt =
    candidate.hoursUntilDeadline != null
      ? new Date(Date.parse(nowIso) + candidate.hoursUntilDeadline * 3600 * 1000).toISOString()
      : undefined;

  if (!existing) {
    const created = await repository.create(
      toNewSignal(
        candidate,
        dedupKey,
        {
          severity: effectiveBaseSeverity,
          actionability: registryDefaults.actionability,
          priorityScore: priority.priorityScore,
          priorityBucket: priority.priorityBucket,
        },
        expiresAt,
        nowIso,
      ),
    );
    return { signal: created, wasNew: true, affectedCountChanged: false };
  }

  const affectedCountChanged = (existing.studentsAffected ?? null) !== (candidate.studentsAffected ?? null);

  const updated = await repository.update(existing.id, {
    evidence: candidate.evidence,
    evidenceMeta: candidate.evidenceMeta,
    studentsAffected: candidate.studentsAffected,
    severity: effectiveBaseSeverity,
    priorityScore: priority.priorityScore,
    priorityBucket: priority.priorityBucket,
    summary: candidate.summary,
    expiresAt,
    lastUpdatedAt: nowIso,
    updateHistory: [
      ...existing.updateHistory,
      {
        at: nowIso,
        note: affectedCountChanged
          ? `Affected count changed: ${existing.studentsAffected ?? '\u2014'} \u2192 ${candidate.studentsAffected ?? '\u2014'}`
          : 'Evidence refreshed; condition persists.',
      },
    ],
  });

  return { signal: updated, wasNew: false, affectedCountChanged };
}

function toNewSignal(
  candidate: SignalCandidate,
  dedupKey: string,
  built: { severity: Severity; actionability: Actionability; priorityScore: number; priorityBucket: Severity },
  expiresAt: string | undefined,
  nowIso: string,
): Omit<ProactiveSignal, 'id'> {
  return {
    institutionId: candidate.institutionId,
    seasonId: candidate.seasonId,
    signalType: candidate.signalType,
    category: candidate.category,
    polarity: candidate.polarity,
    severity: built.severity,
    priorityScore: built.priorityScore,
    priorityBucket: built.priorityBucket,
    status: 'NEW',
    confidence: candidate.confidence,
    actionability: built.actionability,
    title: candidate.title,
    summary: candidate.summary,
    entityType: candidate.entityType,
    entityId: candidate.entityId,
    departmentTag: candidate.departmentTag,
    evidence: candidate.evidence,
    evidenceMeta: candidate.evidenceMeta,
    recommendedAction: candidate.recommendedAction,
    audiences: candidate.audiences,
    dedupKey,
    studentsAffected: candidate.studentsAffected,
    expiresAt,
    detectedAt: nowIso,
    lastUpdatedAt: nowIso,
    escalationHistory: [],
    updateHistory: [{ at: nowIso, note: 'Signal created.' }],
    createdAt: nowIso,
  };
}
