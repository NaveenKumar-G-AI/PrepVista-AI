import { describe, it, expect } from 'vitest';
import { InMemoryRepository } from '../src/db/inMemoryRepository.js';
import { ingestEvidence } from '../src/engine/pipeline.js';
import { AssessmentTier, EvidenceType, type RawEvidenceInput } from '../src/domain/models.js';

const STUDENT = '11111111-1111-1111-1111-111111111111';
const NOW = '2026-08-20T00:00:00.000Z';

function challenge(sourceId: string, passed: boolean, occurredAt = NOW): RawEvidenceInput {
  return {
    sourceType: EvidenceType.CHALLENGE_RESULT,
    sourceId,
    studentId: STUDENT,
    skillIds: ['algorithms'],
    payload: { passed },
    contextGroup: sourceId,
    assessmentTier: AssessmentTier.PRACTICE,
    occurredAt,
  };
}

describe('idempotency (req #49/#84)', () => {
  it('re-delivering the exact same evidence event does not double-count it', async () => {
    const repo = new InMemoryRepository();
    const first = await ingestEvidence(repo, [challenge('sub-1', true)], NOW);
    expect(first.acceptedEvidenceCount).toBe(1);
    expect(first.duplicateEvidenceCount).toBe(0);

    const replay = await ingestEvidence(repo, [challenge('sub-1', true)], NOW);
    expect(replay.acceptedEvidenceCount).toBe(0);
    expect(replay.duplicateEvidenceCount).toBe(1);

    const signal = await repo.getSignal(STUDENT, 'algorithms');
    expect(signal!.evidenceCount).toBe(1); // not 2
    expect(signal!.version).toBe(1); // recomputed once, not twice — no-op recompute is skipped entirely
  });

  it('a genuinely NEW event for the same skill still updates the signal normally', async () => {
    const repo = new InMemoryRepository();
    await ingestEvidence(repo, [challenge('sub-1', true)], NOW);
    const second = await ingestEvidence(repo, [challenge('sub-2', true)], NOW);
    expect(second.acceptedEvidenceCount).toBe(1);
    const signal = await repo.getSignal(STUDENT, 'algorithms');
    expect(signal!.evidenceCount).toBe(2);
  });

  it('bumping evidenceVersion on the SAME sourceId is treated as a correction, not a duplicate', async () => {
    const repo = new InMemoryRepository();
    await ingestEvidence(repo, [{ ...challenge('sub-1', false), evidenceVersion: 1 }], NOW);
    const corrected = await ingestEvidence(repo, [{ ...challenge('sub-1', true), evidenceVersion: 2 }], NOW);
    expect(corrected.acceptedEvidenceCount).toBe(1);
    const signal = await repo.getSignal(STUDENT, 'algorithms');
    expect(signal!.evidenceCount).toBe(2); // both versions kept for provenance (req #9), aggregate reflects both
  });

  it('12 concurrent identical submissions collapse to exactly one accepted evidence record', async () => {
    const repo = new InMemoryRepository();
    const results = await Promise.all(Array.from({ length: 12 }, () => ingestEvidence(repo, [challenge('race-sub', true)], NOW)));
    const totalAccepted = results.reduce((s, r) => s + r.acceptedEvidenceCount, 0);
    expect(totalAccepted).toBe(1);
    const signal = await repo.getSignal(STUDENT, 'algorithms');
    expect(signal!.evidenceCount).toBe(1);
  });
});
