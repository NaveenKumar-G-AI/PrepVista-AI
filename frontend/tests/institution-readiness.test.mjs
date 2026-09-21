import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { loadTs } from './load-ts.mjs';

const entry = (user_id, score, count, extra = {}) => ({
  user_id, latest_score: score, session_count: count, zero_offer_risk: true, ...extra,
});
const fixture = {
  summary: { total_students: 3 },
  tiers: {
    not_measured: [entry('pending', null, 2, { avg_score: 80 })],
    at_risk: [entry('legacy-unknown', null, 1), entry('zero', 0, 1)],
  },
};
const api = () => loadTs('../src/lib/api.ts', {
  URLSearchParams,
  fetch: async () => new Response(JSON.stringify(fixture), {
    headers: { 'Content-Type': 'application/json' },
  }),
}).api;

test('institution adapter includes unmeasured students without converting old averages to current scores', async () => {
  const result = await api().getCohortDistribution();
  assert.equal(result.readiness.grid.length, 3);
  assert.equal(result.readiness.grid.find(row => row.user_id === 'pending').latest_score, null);
  assert.equal(result.readiness.tiers.find(row => row.tier === 'Not measured').count, 2);
  assert.equal(result.percentile.total_scored_students, 1);
  assert.equal(result.percentile.mean, 0);
});

test('legacy missing-score risk flags cannot put unmeasured students on the performance-risk roster', async () => {
  const result = await api().getCohortRiskRoster();
  assert.deepEqual(Array.from(result.roster, row => row.user_id), ['zero']);
});

test('live command-centre history keeps missing scores neutral and genuine zero measured', () => {
  const html = fs.readFileSync(new URL('../public/command-centre.html', import.meta.url), 'utf8');
  const source = html.split('\n').find(line => line.startsWith('function tierAtScoreHistory('));
  const context = {
    isMetric: value => typeof value === 'number' && Number.isFinite(value),
    avg: values => values.reduce((a, b) => a + b, 0) / values.length,
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  for (const rows of [[], [{ score: null }]]) {
    const result = context.tierAtScoreHistory(rows);
    assert.equal(result.tier, 'Not measured');
    assert.equal(result.atRisk, false);
  }
  assert.equal(context.tierAtScoreHistory([{ score: 0 }]).atRisk, true);
});
