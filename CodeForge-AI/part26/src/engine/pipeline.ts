import { randomUUID } from 'node:crypto';
import { MODEL_VERSION, SkillState, Trend, type RawEvidenceInput, type SkillSignal, type SkillSignalHistoryPoint } from '../domain/models.js';
import { SignalPolicy } from '../policy/policy.js';
import type { SkillSignalRepository } from '../db/repository.js';
import { normalizeEvidence } from './normalize.js';
import { aggregateEvidence } from './aggregate.js';
import { computeConfidence } from './confidence.js';
import { computeFreshness } from './freshness.js';
import { deriveState } from './state.js';
import { computeTrend } from './trend.js';
import { computeRetention, computeTransferConfidence } from './transferRetention.js';
import { generateExplanation } from './explain.js';

export interface IngestSummary {
  correlationId: string;
  acceptedEvidenceCount: number;
  duplicateEvidenceCount: number;
  rejectedCount: number;
  rejections: Array<{ reason: string }>;
  updatedSignals: SkillSignal[];
}

const MAX_UPSERT_RETRIES = 25;

function backoffMs(attempt: number): number {
  // Small randomized, growing backoff so a burst of colliding writers doesn't
  // keep re-colliding in lockstep (classic thundering-herd fix). Capped low
  // because a real recompute round-trip is already just a few ms.
  return Math.min(40, 2 * attempt) + Math.floor(Math.random() * 5);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Recomputes and persists the signal for one (student, skill) from whatever
 * evidence is currently stored. Safe to call concurrently for the same pair —
 * optimistic-concurrency retry means the loser of a race recomputes against the
 * winner's fresh state rather than overwriting it (req #50/#51). */
export async function recomputeSignal(
  repo: SkillSignalRepository,
  studentId: string,
  skillId: string,
  nowIso: string,
  correlationId: string
): Promise<SkillSignal> {
  for (let attempt = 0; attempt < MAX_UPSERT_RETRIES; attempt++) {
    const [evidenceForSkill, previousSignal, priorHistory] = await Promise.all([
      repo.getEvidenceForSkill(studentId, skillId),
      repo.getSignal(studentId, skillId),
      repo.getHistory(studentId, skillId),
    ]);

    const agg = aggregateEvidence(evidenceForSkill, studentId, skillId, nowIso);
    const confidence = computeConfidence(agg);
    const freshness = computeFreshness(agg.lastDemonstratedAt, nowIso);
    const previousState = previousSignal?.state ?? SkillState.UNKNOWN;

    const recentCutoff = SignalPolicy.aggregation.recentWindowDays;
    const recentEvidence = evidenceForSkill.filter(
      (e) => (Date.parse(nowIso) - Date.parse(e.occurredAt)) / (1000 * 60 * 60 * 24) <= recentCutoff
    );

    const state = deriveState({ previousState, agg, confidence, recentEvidence });
    const transferConfidence = computeTransferConfidence(agg);
    const retention = computeRetention(evidenceForSkill);

    const trendHistoryInput: SkillSignalHistoryPoint[] = [
      ...priorHistory,
      { skillId, studentId, signal: agg.weightedSignal, confidence, state, trend: Trend.STABLE, recordedAt: nowIso, policyVersion: SignalPolicy.version },
    ];
    const { trend } = computeTrend(trendHistoryInput);

    const expectedVersion = previousSignal?.version ?? null;
    const nextVersion = (previousSignal?.version ?? 0) + 1;

    const newSignal: SkillSignal = {
      skillId,
      studentId,
      signal: agg.weightedSignal,
      confidence,
      state,
      trend,
      freshness,
      evidenceCount: agg.evidenceCount,
      diversity: agg.diversity,
      transferConfidence,
      retention,
      lastDemonstratedAt: agg.lastDemonstratedAt,
      firstObservedAt: agg.firstObservedAt,
      contradiction: agg.contradictionMagnitude > 0,
      modelVersion: MODEL_VERSION,
      policyVersion: SignalPolicy.version,
      updatedAt: nowIso,
      version: nextVersion,
    };

    const result = await repo.upsertSignal(newSignal, expectedVersion);
    if (!result.ok) {
      // Someone else updated this signal between our read and write. Back off
      // briefly, then loop and recompute fresh against their version rather
      // than clobbering it or hammering the row in lockstep.
      await sleep(backoffMs(attempt));
      continue;
    }

    await repo.appendHistory({ skillId, studentId, signal: newSignal.signal, confidence, state, trend, recordedAt: nowIso, policyVersion: SignalPolicy.version });

    if (!previousSignal) {
      await repo.appendAudit({ correlationId, studentId, skillId, eventType: 'signal_created', details: { signal: newSignal.signal, state }, occurredAt: nowIso });
    } else {
      await repo.appendAudit({ correlationId, studentId, skillId, eventType: 'signal_updated', details: { from: previousSignal.signal, to: newSignal.signal }, occurredAt: nowIso });
      if (previousSignal.state !== state) {
        await repo.appendAudit({ correlationId, studentId, skillId, eventType: 'state_changed', details: { from: previousSignal.state, to: state }, occurredAt: nowIso });
      }
      if (Math.abs(previousSignal.confidence - confidence) > 0.05) {
        await repo.appendAudit({ correlationId, studentId, skillId, eventType: 'confidence_changed', details: { from: previousSignal.confidence, to: confidence }, occurredAt: nowIso });
      }
      if (previousSignal.trend !== trend) {
        await repo.appendAudit({ correlationId, studentId, skillId, eventType: 'trend_changed', details: { from: previousSignal.trend, to: trend }, occurredAt: nowIso });
      }
    }

    const explanation = generateExplanation({ skillId, studentId, agg, state, trend, confidence, transferConfidence, recentEvidence, nowIso });
    await repo.saveExplanation(explanation);

    return newSignal;
  }

  throw new Error(`recomputeSignal: exceeded ${MAX_UPSERT_RETRIES} retries for ${studentId}/${skillId} — persistent write contention`);
}

/** Full ingest entrypoint: validates/normalizes raw evidence from upstream systems,
 * dedupes, persists, and recomputes every affected skill signal. */
export async function ingestEvidence(repo: SkillSignalRepository, rawInputs: RawEvidenceInput[], nowIso: string): Promise<IngestSummary> {
  const correlationId = randomUUID();
  const allNormalized: ReturnType<typeof normalizeEvidence>['evidence'] = [];
  const rejections: Array<{ reason: string }> = [];

  for (const raw of rawInputs) {
    await repo.appendAudit({ correlationId, studentId: raw.studentId, skillId: raw.skillIds[0] ?? null, eventType: 'evidence_received', details: { sourceType: raw.sourceType, sourceId: raw.sourceId }, occurredAt: nowIso });
    const outcome = normalizeEvidence(raw, nowIso);
    if (outcome.rejected.length > 0) {
      for (const r of outcome.rejected) {
        rejections.push({ reason: r.reason });
        await repo.appendAudit({ correlationId, studentId: raw.studentId, skillId: null, eventType: 'evidence_rejected', details: { reason: r.reason, sourceType: raw.sourceType, sourceId: raw.sourceId }, occurredAt: nowIso });
      }
    }
    allNormalized.push(...outcome.evidence);
  }

  const { inserted, duplicates } = await repo.insertEvidenceIfNew(allNormalized);

  for (const d of duplicates) {
    await repo.appendAudit({ correlationId, studentId: d.studentId, skillId: d.skillId, eventType: 'evidence_deduplicated', details: { evidenceId: d.evidenceId }, occurredAt: nowIso });
  }
  for (const i of inserted) {
    await repo.appendAudit({ correlationId, studentId: i.studentId, skillId: i.skillId, eventType: 'evidence_validated', details: { evidenceId: i.evidenceId, normalizedValue: i.normalizedValue }, occurredAt: nowIso });
  }

  const affectedPairs = new Map<string, { studentId: string; skillId: string }>();
  for (const e of inserted) affectedPairs.set(`${e.studentId}::${e.skillId}`, { studentId: e.studentId, skillId: e.skillId });

  const updatedSignals: SkillSignal[] = [];
  for (const { studentId, skillId } of affectedPairs.values()) {
    updatedSignals.push(await recomputeSignal(repo, studentId, skillId, nowIso, correlationId));
  }

  return {
    correlationId,
    acceptedEvidenceCount: inserted.length,
    duplicateEvidenceCount: duplicates.length,
    rejectedCount: rejections.length,
    rejections,
    updatedSignals,
  };
}
