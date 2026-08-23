import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InMemorySignalRepository } from '../../services/signals/repository';
import { upsertSignal } from '../../services/dedup/deduplicationEngine';
import { nextEscalatedSeverity, runEscalationSweep } from '../../services/escalation/escalationEngine';
import type { SignalCandidate } from '../../services/signals/types';

function candidate(overrides: Partial<SignalCandidate> = {}): SignalCandidate {
  return {
    institutionId: 'inst_1',
    seasonId: 'season_1',
    signalType: 'APPLICATION_ELIGIBLE_NOT_APPLIED',
    category: 'APPLICATION',
    polarity: 'RISK',
    entityType: 'DRIVE',
    entityId: 'drive_1',
    title: '83 eligible students have not applied',
    summary: 'summary',
    evidence: { eligible: 428, applied: 345 },
    evidenceMeta: { dataAsOf: new Date().toISOString(), isStale: false },
    confidence: 'HIGH_CONFIDENCE',
    studentsAffected: 83,
    audiences: ['TPO'],
    ...overrides,
  };
}

const defaults = { severity: 'MEDIUM' as const, actionability: 'REVIEW' as const };

test('second detection of the same problem updates in place, not a duplicate (section 15)', async () => {
  const repo = new InMemorySignalRepository();

  const first = await upsertSignal(repo, candidate({ studentsAffected: 83 }), defaults);
  assert.equal(first.wasNew, true);

  const second = await upsertSignal(repo, candidate({ studentsAffected: 76 }), defaults);
  assert.equal(second.wasNew, false);
  assert.equal(second.signal.id, first.signal.id);
  assert.equal(second.signal.studentsAffected, 76);
  assert.equal(second.affectedCountChanged, true);

  const all = await repo.listByInstitution('inst_1');
  assert.equal(all.length, 1); // never fanned out into a second record
});

test('a different entity gets its own signal', async () => {
  const repo = new InMemorySignalRepository();
  await upsertSignal(repo, candidate({ entityId: 'drive_1' }), defaults);
  await upsertSignal(repo, candidate({ entityId: 'drive_2' }), defaults);

  const all = await repo.listByInstitution('inst_1');
  assert.equal(all.length, 2);
});

test('a resolved signal does not absorb the next detection — a fresh one opens', async () => {
  const repo = new InMemorySignalRepository();
  const { signal } = await upsertSignal(repo, candidate(), defaults);
  await repo.update(signal.id, { status: 'RESOLVED', resolvedAt: new Date().toISOString() });

  const next = await upsertSignal(repo, candidate(), defaults);
  assert.equal(next.wasNew, true);
  assert.notEqual(next.signal.id, signal.id);
});

test('dedup refresh never downgrades severity an escalation already raised', async () => {
  const repo = new InMemorySignalRepository();
  const { signal } = await upsertSignal(repo, candidate(), defaults);
  await repo.update(signal.id, { severity: 'CRITICAL' }); // simulate a prior escalation

  const refreshed = await upsertSignal(repo, candidate(), defaults); // registry still says MEDIUM
  assert.equal(refreshed.signal.severity, 'CRITICAL');
});

test('escalation: unresolved past the 24h threshold jumps straight to CRITICAL', () => {
  const detectedAt = new Date(Date.now() - 30 * 3600 * 1000).toISOString(); // 30h ago
  const result = nextEscalatedSeverity({ signalType: 'APPLICATION_ELIGIBLE_NOT_APPLIED', severity: 'MEDIUM', detectedAt }, new Date());
  assert.equal(result?.severity, 'CRITICAL');
});

test('escalation: a fresh signal does not escalate', () => {
  const detectedAt = new Date(Date.now() - 1 * 3600 * 1000).toISOString();
  const result = nextEscalatedSeverity({ signalType: 'APPLICATION_ELIGIBLE_NOT_APPLIED', severity: 'MEDIUM', detectedAt }, new Date());
  assert.equal(result, null);
});

test('escalation sweep skips snoozed signals (section 18)', async () => {
  const repo = new InMemorySignalRepository();
  const { signal } = await upsertSignal(repo, candidate(), defaults);
  await repo.update(signal.id, { status: 'SNOOZED', detectedAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString() });

  const result = await runEscalationSweep(repo, new Date());
  assert.equal(result.escalated.length, 0);
});

test('escalation sweep escalates an open, overdue signal and records why', async () => {
  const repo = new InMemorySignalRepository();
  const { signal } = await upsertSignal(repo, candidate(), defaults);
  await repo.update(signal.id, { detectedAt: new Date(Date.now() - 30 * 3600 * 1000).toISOString() });

  const result = await runEscalationSweep(repo, new Date());
  assert.equal(result.escalated.length, 1);
  assert.equal(result.escalated[0].to, 'CRITICAL');

  const updated = await repo.get(signal.id);
  assert.equal(updated?.escalationHistory.length, 1);
});
