import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
function harness(states = []) {
  let index = 0;
  const cache = new Map();
  const context = vm.createContext({ console, Date, JSON, Math });
  const jsx = (type, props) => ({ type, props });
  const empty = () => null;
  const mocks = {
    react: { useState: value => [index < states.length ? states[index++] : value, empty],
      useEffect: empty, useCallback: fn => fn, useRef: value => ({ current: value }), useMemo: fn => fn() },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'next/link': { default: ({ children }) => children },
    'next/navigation': { useRouter: () => ({ push: empty, replace: empty }), useParams: () => ({ id: 'session' }) },
    '@/lib/auth-context': { useAuth: () => ({ user: { org_student: true, plan: 'career', usage: { used: 1, limit: 20, remaining: 19 } }, loading: false }) },
    '@/lib/api': { api: new Proxy({}, { get: () => () => { throw Error('Unmocked network'); } }) },
    '@/lib/plan-usage': { getStartInterviewHref: () => '/interview/setup', hasRemainingUsage: () => true, isUnlimitedUsage: () => false },
    './_intel/dashboard': { IntelDashboard: empty },
  };
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (cache.has(filename)) return cache.get(filename).exports;
    const mod = { exports: {} };
    cache.set(filename, mod);
    const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX,
    } }).outputText;
    function requireLocal(name) {
      if (name in mocks) return mocks[name];
      if (name === '@/components/score-summary' || name === '@/lib/score-semantics' || name === '@/lib/assistance-views') {
        return load(`src/${name.slice(2)}.${name.includes('components') ? 'tsx' : 'ts'}`);
      }
      // Unrelated visual components are inert; page and score rendering stay real.
      if (name.includes('components') || name === 'lucide-react') return new Proxy({}, { get: () => empty });
      throw Error(`Unmocked import ${name}`);
    }
    vm.runInContext(`(function(require,module,exports){${code}\n})`, context, { filename })(requireLocal, mod, mod.exports);
    return mod.exports;
  }
  return { load };
}
function text(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(text).join(' ');
  if (typeof node === 'object') return typeof node.type === 'function'
    ? text(node.type(node.props)) : text(node.props?.children);
  return String(node);
}
const cases = [
  [0, 'COMPLETE', '0/100'], [null, 'NOT_MEASURED', 'Not measured'],
  [null, 'PENDING', 'Evaluation pending'], [80, 'PARTIALLY_COMPLETE', 'Partially measured'],
  [null, 'UNAVAILABLE', 'Evaluation unavailable'],
];
for (const [value, state, expected] of cases) {
  const measurement = { evaluation_state: state, readiness_eligible: state === 'COMPLETE',
    measurement_coverage: { asked: 3, measured: value === null ? 0 : 1, intentional: 0 } };
  test(`actual ScoreSummary: ${state} (${value})`, () => {
    const { ScoreSummary } = harness().load('src/components/score-summary.tsx');
    const output = text(ScoreSummary({ value, measurement }));
    assert.ok(output.includes(expected), output);
    assert.match(output, /\/\s*3\s+assessed/);
    if (value === null) assert.ok(!output.includes('0/100'));
  });
  test(`actual history page: ${state}`, () => {
    const card = { id: 'session', score: value, plan: 'career', state: 'FINISHED', total_turns: 3,
      created_at: '2026-10-04', ...measurement };
    const h = harness([{ sessions: [card], total: 1, locked: false }, false, null, null, false, [], '', '']);
    const output = text(h.load('src/app/history/page.tsx').default());
    assert.ok(output.includes(value === 0 ? '0%' : expected), output);
    if (value === null) assert.ok(!output.includes('0/100'));
  });
  test(`actual college-student dashboard: ${state}`, () => {
    const card = { id: 'session', final_score: value, plan: 'career', state: 'FINISHED', total_turns: 3,
      created_at: '2026-10-04', ...measurement };
    const h = harness([{ user: { name: 'Student', plan: 'career' }, usage: { used: 1, limit: 20, remaining: 19 }, recent_sessions: [card] }, '', null]);
    const output = text(h.load('src/app/student-dashboard/page.tsx').default());
    assert.ok(output.includes(expected), output);
    if (value === null) assert.ok(!output.includes('0/100'));
  });
  test(`actual owner report page: ${state}`, () => {
    const report = { session: { id: 'session', plan: 'career', final_score: value, ...measurement,
      total_turns: 3, created_at: '2026-10-04', strengths: [], weaknesses: [], rubric_scores: {} },
      evaluations: [], user_plan: 'career', has_premium_access: false };
    const h = harness([report, false, '', false, false, '', '']);
    const output = text(h.load('src/app/report/[id]/page.tsx').default());
    assert.ok(value === 0 ? /\b0\b[\s\S]*out of 100/.test(output) : output.includes(expected), output);
    if (value === null) assert.ok(!output.includes('0/100'));
  });
}
test('actual Intel model withholds missing dimensions and partial readiness', () => {
  const { buildIntel } = harness().load('src/app/report/[id]/_intel/model.ts');
  assert.equal(buildIntel({ session: { final_score: 80 }, evaluations: [{ turn_number: 1, score: 8 }] }), null);
  assert.equal(buildIntel({ session: { final_score: null }, evaluations: [] }), null);
  assert.equal(buildIntel({ session: { final_score: 80, readiness_eligible: false }, evaluations: [] }), null);
});
test('actual Intel model retains measured zero and uses only authentic contributions', () => {
  const { buildIntel } = harness().load('src/app/report/[id]/_intel/model.ts');
  const evaluated = { turn_number: 1, score: 0, communication_score: 0, relevance_score: 0,
    clarity_score: 0, specificity_score: 0, structure_score: 0, classification: 'wrong', rubric_category: 'communication' };
  const model = buildIntel({ session: { final_score: 0, score_contributions: { communication: 0 } }, evaluations: [evaluated] });
  assert.ok(model);
  assert.equal(model.momentum.values[0], 0);
  assert.equal(model.decay.values.length, 0);
  assert.equal(model.waterfall.labels.length, 2);
  assert.ok(model.waterfall.values.every(value => value === 0));
});

// Execute live HTML functions, extracting complete declarations via TypeScript's
// JS parser. External chart, PDF and DOM services have no network fallback.
function htmlFunctions(filename, declarations, extra = '') {
  const html = fs.readFileSync(path.join(root, 'public', filename), 'utf8');
  const source = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(match => match[1]).join('\n');
  const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const snippets = ast.statements.filter(node => {
    const name = node.name?.text ?? node.declarationList?.declarations[0]?.name?.text;
    return declarations.includes(name);
  }).map(node => node.getText(ast));
  assert.equal(snippets.length, declarations.length);
  const context = vm.createContext({ console, Math, Date });
  vm.runInContext(`${snippets.join('\n')}\n${extra}`, context);
  return context;
}
test('live command centre: unknown and partial results never become risk or percentile zero', () => {
  const c = htmlFunctions('command-centre.html', ['round', 'avg', 'isMetric', 'tiedPercentile', 'computePercentiles', 'tierAtScoreHistory', 'snapshotAt'],
    `var STUDENTS=[{started:true,firstScore:0,latestScore:0},{started:true,firstScore:80,latestScore:80},{started:true,latestScore:null}];computePercentiles();`);
  assert.equal(c.STUDENTS[2].pctNow, null);
  assert.equal(c.STUDENTS[0].pctNow, 0);
  assert.equal(c.tierAtScoreHistory([{ score: null }]).atRisk, false);
  assert.equal(c.tierAtScoreHistory([{ score: 80, readiness_eligible: false }]).atRisk, false);
  assert.equal(c.tierAtScoreHistory([{ score: 0, readiness_eligible: true }]).atRisk, true);
  assert.equal(c.snapshotAt([{ scoreHistory: [{ at: '2026-10-01', score: null }] }], Date.now()).readiness, null);
});
test('live leaderboard: NULL is visible and unranked; a measured zero is ranked', () => {
  const c = htmlFunctions('scoreboard.html', ['rankList', 'passTier'], `var state={tiers:new Set(['Ready','Almost','Developing','At Risk'])};`);
  const result = c.rankList([{ id: 'zero', started: true, score: 0 }, { id: 'null', started: true, score: null }, { id: 'positive', started: true, score: 80 }]);
  assert.equal(result.scored.length, 2);
  assert.ok(c.passTier({ started: true, score: null, tier: 'Not measured' }));
});

for (const [value, state, expected] of cases) {
  test(`actual college report/export preview: ${state}`, () => {
    const student = { full_name: 'Student', email: 'student@example.test', total_interviews: 1,
      avg_score: value, best_score: value, latest_score: value, evaluation_state: state,
      readiness_eligible: state === 'COMPLETE', measurement_coverage: { asked: 3, measured: value == null ? 0 : 1, intentional: 0 } };
    const h = harness([[student], 1]);
    const output = text(h.load('src/app/org-admin/reports/page.tsx').default());
    assert.ok(output.includes(expected), output);
    if (value == null) assert.ok(!output.includes('0/100'));
  });
}

test('actual college API adapters retain neutral statuses and never substitute an older average for latest NULL', () => {
  const source = fs.readFileSync(path.join(root, 'src/lib/api.ts'), 'utf8');
  const names = ['TIER_META','TIER_KEYS','cObj','cArr','cNum','cRound','adaptReadinessDistribution','adaptRiskRoster'];
  const ast = ts.createSourceFile('api.ts', source, ts.ScriptTarget.Latest, true);
  const nodes = ast.statements.filter(node => names.includes(node.name?.text ?? node.declarationList?.declarations[0]?.name?.text));
  assert.equal(nodes.length, names.length);
  const code = ts.transpileModule(nodes.map(node => node.getText(ast)).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  const c = vm.createContext({ Math });
  vm.runInContext(code, c);
  const raw = { summary: { total_students: 3 }, tiers: {
    at_risk: [{ user_id:'zero',session_count:1,latest_score:0,avg_score:0,zero_offer_risk:true,readiness_eligible:true }],
    not_measured: [{ user_id:'null',session_count:1,latest_score:null,avg_score:80,readiness_eligible:false }],
    partially_measured: [{ user_id:'partial',session_count:1,latest_score:80,readiness_eligible:false }],
  } };
  const readiness = c.adaptReadinessDistribution(raw);
  assert.equal(readiness.readiness.grid.length, 3);
  assert.equal(readiness.readiness.grid.find(row => row.user_id === 'null').latest_score, null);
  assert.equal(readiness.percentile.total_scored_students, 2);
  const risk = c.adaptRiskRoster(raw).roster;
  assert.equal(risk.length, 1);
  assert.equal(risk[0].user_id, 'zero');
});
