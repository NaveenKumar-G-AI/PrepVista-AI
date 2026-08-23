import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSampleSufficiency, compareToBaseline, detectTrend } from '../../services/anomaly/anomalyEngine';
import { clusterSignals } from '../../services/clustering/signalClustering';
import type { ProactiveSignal } from '../../services/signals/types';

test('small sample is flagged insufficient (section 52)', () => {
  const result = checkSampleSufficiency(5, 10);
  assert.equal(result.sufficient, false);
  assert.ok(result.note);
});

test('adequate sample proceeds without a note', () => {
  const result = checkSampleSufficiency(50, 10);
  assert.equal(result.sufficient, true);
  assert.equal(result.note, undefined);
});

test('a two-point series is not enough for a trend (section 53)', () => {
  const trend = detectTrend([
    { date: '2026-08-01', value: 40 },
    { date: '2026-08-02', value: 10 },
  ]);
  assert.equal(trend, 'INSUFFICIENT_DATA');
});

test('sustained decline over several points is a DECLINE trend', () => {
  const trend = detectTrend([
    { date: '2026-08-01', value: 80 },
    { date: '2026-08-02', value: 70 },
    { date: '2026-08-03', value: 60 },
    { date: '2026-08-04', value: 50 },
  ]);
  assert.equal(trend, 'DECLINE');
});

test('a choppy series with no consistent direction is VOLATILE, not a trend', () => {
  const trend = detectTrend([
    { date: '2026-08-01', value: 50 },
    { date: '2026-08-02', value: 65 },
    { date: '2026-08-03', value: 45 },
    { date: '2026-08-04', value: 60 },
  ]);
  assert.equal(trend, 'VOLATILE');
});

test('baseline comparison requires both magnitude and sample size (section 51/52)', () => {
  const tooSmall = compareToBaseline(45, 40, { minimumPercentDelta: 20, sampleSize: 3, minimumSampleSize: 10 });
  assert.equal(tooSmall.isNotable, false);

  const real = compareToBaseline(60, 40, { minimumPercentDelta: 20, sampleSize: 50, minimumSampleSize: 10 });
  assert.equal(real.isNotable, true);
});

function makeSignal(overrides: Partial<ProactiveSignal>): ProactiveSignal {
  const now = new Date().toISOString();
  return {
    id: Math.random().toString(36).slice(2),
    institutionId: 'inst_1',
    seasonId: 'season_1',
    signalType: 'X',
    category: 'APPLICATION',
    polarity: 'RISK',
    severity: 'MEDIUM',
    priorityScore: 50,
    priorityBucket: 'MEDIUM',
    status: 'NEW',
    confidence: 'HIGH_CONFIDENCE',
    actionability: 'REVIEW',
    title: 't',
    summary: 's',
    entityType: 'DRIVE',
    entityId: 'd1',
    departmentTag: 'ECE',
    evidence: {},
    evidenceMeta: { dataAsOf: now, isStale: false },
    audiences: ['TPO'],
    dedupKey: Math.random().toString(36).slice(2),
    detectedAt: now,
    lastUpdatedAt: now,
    escalationHistory: [],
    updateHistory: [],
    createdAt: now,
    ...overrides,
  };
}

test('3+ related signals across 2+ categories in the same department cluster together (section 54)', () => {
  const signals = [makeSignal({ category: 'APPLICATION' }), makeSignal({ category: 'READINESS' }), makeSignal({ category: 'INTERVIEW' })];
  const clusters = clusterSignals(signals, new Date());
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].childSignalIds.length, 3);
});

test('two signals in the same single category do not cluster (not a pattern yet)', () => {
  const signals = [makeSignal({ category: 'APPLICATION' }), makeSignal({ category: 'APPLICATION' })];
  const clusters = clusterSignals(signals, new Date());
  assert.equal(clusters.length, 0);
});

test('signals in different departments never cluster together', () => {
  const signals = [
    makeSignal({ category: 'APPLICATION', departmentTag: 'ECE' }),
    makeSignal({ category: 'READINESS', departmentTag: 'CSE' }),
    makeSignal({ category: 'INTERVIEW', departmentTag: 'MECH' }),
  ];
  const clusters = clusterSignals(signals, new Date());
  assert.equal(clusters.length, 0);
});
