import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PgRepository } from '../src/db/pgRepository.js';
import { ingestEvidence, recomputeSignal } from '../src/engine/pipeline.js';
import { AssessmentTier, EvidenceType, SkillState, Trend, type RawEvidenceInput } from '../src/domain/models.js';

const CONN = process.env.DATABASE_URL_SERVICE ?? 'postgres://app_service:svc_local_dev_pw@localhost:5432/skillsignal';

describe('golden end-to-end scenario (req #86) — real Postgres, real RLS-governed writes', () => {
  const repo = new PgRepository({ connectionString: CONN });
  const student = randomUUID();
  const now = () => new Date().toISOString();

  afterAll(async () => {
    await repo.close();
  });

  it('walks the full fixture and produces an explainable, evidence-consistent final profile', async () => {
    // --- Starting state: seed history establishing "algorithms strong", "debugging
    // moderate", "state_reasoning weak" per the spec's fixture (req #86). ---
    const baseline: RawEvidenceInput[] = [];
    for (let i = 0; i < 10; i++) {
      baseline.push({
        sourceType: EvidenceType.CORRECTNESS_RESULT,
        sourceId: `algo-baseline-${i}`,
        studentId: student,
        skillIds: ['algorithms'],
        payload: { testsPassed: 9, testsTotal: 10 },
        contextGroup: `algo-family-${i}`,
        difficulty: 0.6,
        assessmentTier: AssessmentTier.PRACTICE,
        occurredAt: new Date(Date.now() - (60 + i * 3) * 86400000).toISOString(),
      });
    }
    for (let i = 0; i < 3; i++) {
      baseline.push({
        sourceType: EvidenceType.DEBUGGING_RESULT,
        sourceId: `debug-baseline-${i}`,
        studentId: student,
        skillIds: ['debugging'],
        payload: { faultLocalized: true, rootCauseIdentified: i > 0, fixValid: i > 0, regressionVerified: false },
        contextGroup: `debug-family-${i}`,
        occurredAt: new Date(Date.now() - (50 + i * 4) * 86400000).toISOString(),
      });
    }
    baseline.push({
      sourceType: EvidenceType.REASONING_RESULT,
      sourceId: 'state-baseline-0',
      studentId: student,
      skillIds: ['state_reasoning'],
      payload: { category: 'weak' },
      contextGroup: 'state-family-0',
      occurredAt: new Date(Date.now() - 45 * 86400000).toISOString(),
    });

    const baselineResult = await ingestEvidence(repo, baseline, now());
    expect(baselineResult.rejectedCount).toBe(0);

    const startAlgorithms = await repo.getSignal(student, 'algorithms');
    const startDebugging = await repo.getSignal(student, 'debugging');
    const startStateReasoning = await repo.getSignal(student, 'state_reasoning');

    console.log('\n[GOLDEN SCENARIO] Starting point:');
    console.log('  algorithms      :', startAlgorithms!.state, 'signal=' + startAlgorithms!.signal.toFixed(2), 'confidence=' + startAlgorithms!.confidence.toFixed(2));
    console.log('  debugging       :', startDebugging!.state, 'signal=' + startDebugging!.signal.toFixed(2), 'confidence=' + startDebugging!.confidence.toFixed(2));
    console.log('  state_reasoning :', startStateReasoning!.state, 'signal=' + startStateReasoning!.signal.toFixed(2), 'confidence=' + startStateReasoning!.confidence.toFixed(2));

    expect(startAlgorithms!.signal).toBeGreaterThan(0.7);
    expect(startStateReasoning!.signal).toBeLessThan(0.4);

    // --- Challenge 1: correct, but reasoning weak -> state_reasoning evidence updated ---
    await ingestEvidence(
      repo,
      [
        { sourceType: EvidenceType.CORRECTNESS_RESULT, sourceId: 'ch1-correctness', studentId: student, skillIds: ['state_reasoning'], payload: { testsPassed: 1, testsTotal: 1 }, contextGroup: 'state-family-1', occurredAt: now() },
        { sourceType: EvidenceType.REASONING_RESULT, sourceId: 'ch1-reasoning', studentId: student, skillIds: ['state_reasoning'], payload: { category: 'weak' }, contextGroup: 'state-family-1', occurredAt: now() },
      ],
      now()
    );
    const afterCh1 = await repo.getSignal(student, 'state_reasoning');

    // --- Challenge 2: correct, strong reasoning -> state_reasoning improves ---
    await ingestEvidence(
      repo,
      [
        { sourceType: EvidenceType.CORRECTNESS_RESULT, sourceId: 'ch2-correctness', studentId: student, skillIds: ['state_reasoning'], payload: { testsPassed: 1, testsTotal: 1 }, contextGroup: 'state-family-2', occurredAt: now() },
        { sourceType: EvidenceType.REASONING_RESULT, sourceId: 'ch2-reasoning', studentId: student, skillIds: ['state_reasoning'], payload: { category: 'strong' }, contextGroup: 'state-family-2', occurredAt: now() },
      ],
      now()
    );
    const afterCh2 = await repo.getSignal(student, 'state_reasoning');

    console.log('[GOLDEN SCENARIO] state_reasoning after Challenge 1 (correct, weak reasoning): signal=' + afterCh1!.signal.toFixed(2));
    console.log('[GOLDEN SCENARIO] state_reasoning after Challenge 2 (correct, strong reasoning): signal=' + afterCh2!.signal.toFixed(2), 'trend=' + afterCh2!.trend);

    expect(afterCh2!.signal).toBeGreaterThan(startStateReasoning!.signal);

    // --- Transfer Challenge: failure -> transfer confidence stays low ---
    await ingestEvidence(
      repo,
      [{ sourceType: EvidenceType.TRANSFER_RESULT, sourceId: 'transfer-1', studentId: student, skillIds: ['state_reasoning'], payload: { passed: false, transferDistance: 'FAR' }, contextGroup: 'state-transfer-unfamiliar', occurredAt: now() }],
      now()
    );
    const afterTransfer = await repo.getSignal(student, 'state_reasoning');
    console.log('[GOLDEN SCENARIO] state_reasoning after failed Transfer Challenge: transferConfidence=' + afterTransfer!.transferConfidence.toFixed(2), '(base signal still ' + afterTransfer!.signal.toFixed(2) + ')');

    expect(afterTransfer!.transferConfidence).toBeLessThan(0.3);

    // --- Debugging Challenge: success -> debugging improves ---
    await ingestEvidence(
      repo,
      [{ sourceType: EvidenceType.DEBUGGING_RESULT, sourceId: 'debug-new-1', studentId: student, skillIds: ['debugging'], payload: { faultLocalized: true, rootCauseIdentified: true, fixValid: true, regressionVerified: true }, contextGroup: 'debug-family-new', occurredAt: now() }],
      now()
    );
    const finalDebugging = await repo.getSignal(student, 'debugging');
    console.log('[GOLDEN SCENARIO] debugging after new success: signal=' + finalDebugging!.signal.toFixed(2), 'vs start=' + startDebugging!.signal.toFixed(2));
    expect(finalDebugging!.signal).toBeGreaterThan(startDebugging!.signal);

    // --- algorithms should remain essentially unaffected (no new evidence touched it) ---
    const finalAlgorithms = await repo.getSignal(student, 'algorithms');
    expect(finalAlgorithms!.signal).toBeCloseTo(startAlgorithms!.signal, 5);
    expect(finalAlgorithms!.evidenceCount).toBe(startAlgorithms!.evidenceCount);

    // --- explanations are real and evidence-grounded, not templated fluff ---
    const explanation = await repo.getExplanation(student, 'state_reasoning');
    expect(explanation!.summary).toMatch(/state reasoning/i);
    expect(explanation!.evidenceHighlights.length).toBeGreaterThan(0);

    console.log('\n[GOLDEN SCENARIO] Final profile:');
    console.log('  algorithms      :', finalAlgorithms!.state, 'signal=' + finalAlgorithms!.signal.toFixed(2), 'confidence=' + finalAlgorithms!.confidence.toFixed(2));
    console.log('  state_reasoning :', afterTransfer!.state, 'signal=' + afterTransfer!.signal.toFixed(2), 'transferConfidence=' + afterTransfer!.transferConfidence.toFixed(2));
    console.log('  debugging       :', finalDebugging!.state, 'signal=' + finalDebugging!.signal.toFixed(2));
    console.log('  state_reasoning explanation:', explanation!.summary);
  }, 30000);

  it('the audit trail reconstructs exactly what happened for this student (req #95/#97)', async () => {
    const audit = await repo.getAudit({ studentId: student });
    const eventTypes = new Set(audit.map((a) => a.eventType));
    expect(eventTypes.has('evidence_received')).toBe(true);
    expect(eventTypes.has('evidence_validated')).toBe(true);
    expect(eventTypes.has('signal_created')).toBe(true);
    expect(eventTypes.has('signal_updated')).toBe(true);
    expect(audit.length).toBeGreaterThan(10);
  });
});

describe('concurrency: two recomputations racing for the same skill (req #50/#84)', () => {
  const repo = new PgRepository({ connectionString: CONN });
  const student = randomUUID();

  afterAll(async () => {
    await repo.close();
  });

  it('final signal is consistent — no lost update, no double-applied evidence', async () => {
    const inputs: RawEvidenceInput[] = Array.from({ length: 6 }, (_, i) => ({
      sourceType: EvidenceType.CORRECTNESS_RESULT,
      sourceId: `race-${i}`,
      studentId: student,
      skillIds: ['algorithms'],
      payload: { testsPassed: 1, testsTotal: 1 },
      contextGroup: `race-ctx-${i}`,
      occurredAt: new Date().toISOString(),
    }));

    // Simulate "submission completes + analysis finishes + next-challenge request" all
    // landing near-simultaneously: ingest each item concurrently, then also fire
    // several bare recomputeSignal calls concurrently on top.
    await Promise.all(inputs.map((i) => ingestEvidence(repo, [i], new Date().toISOString())));
    const correlationId = randomUUID();
    await Promise.all(Array.from({ length: 5 }, () => recomputeSignal(repo, student, 'algorithms', new Date().toISOString(), correlationId)));

    const final = await repo.getSignal(student, 'algorithms');
    expect(final!.evidenceCount).toBe(6); // every evidence item landed exactly once
    expect(final!.signal).toBeCloseTo(1, 5); // all passed -> signal should reflect all 6, not a partial view
  }, 30000);
});
