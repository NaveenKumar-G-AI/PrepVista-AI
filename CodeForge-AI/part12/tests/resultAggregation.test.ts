import { test, run, assert } from './testHarness.js';
import {
  classifySingleRun,
  worstVerdict,
  buildPublicResult,
  buildHiddenResult,
  computeScore,
  determineOverallVerdict,
  defaultChecker,
} from '../src/services/resultAggregation.js';
import type { RunResult } from '../src/execution/executionProvider.js';
import type { ExecutionConfig } from '../src/domain/types.js';

const CONFIG: ExecutionConfig = { cpuTimeLimitMs: 1000, wallTimeLimitMs: 2000, memoryLimitKb: 65536, outputLimitBytes: 4096, processLimit: 8, networkAllowed: false };

function baseRun(overrides: Partial<RunResult> = {}): RunResult {
  return { exitCode: 0, signal: null, stdout: '', stderr: '', wallMs: 10, cpuMs: 5, memoryKb: 100, timedOut: false, outOfMemory: false, outputTruncated: false, ...overrides };
}

test('defaultChecker: exact match after trailing-whitespace normalization', () => {
  assert.equal(defaultChecker('5\n', '5\n', ''), true);
  assert.equal(defaultChecker('5', '5\n\n\n', ''), true, 'trailing blank lines should not matter');
  assert.equal(defaultChecker('5 \n', '5\n', ''), true, 'trailing spaces on a line should not matter');
  assert.equal(defaultChecker('5', '6', ''), false);
  assert.equal(defaultChecker(' 5', '5', ''), false, 'LEADING whitespace differences still matter — only trailing is normalized');
});

test('classification priority: timeout wins even if output happened to be correct', () => {
  const r = baseRun({ timedOut: true, stdout: 'correct', exitCode: null });
  assert.equal(classifySingleRun(r, CONFIG, 'correct', ''), 'TIME_LIMIT_EXCEEDED');
});

test('classification priority: memory limit wins over a runtime error exit code', () => {
  const r = baseRun({ memoryKb: 70000, exitCode: 1 }); // over the 65536 limit
  assert.equal(classifySingleRun(r, CONFIG, 'x', ''), 'MEMORY_LIMIT_EXCEEDED');
});

test('classification: output truncation is reported distinctly from wrong answer', () => {
  const r = baseRun({ outputTruncated: true, stdout: 'partial...' });
  assert.equal(classifySingleRun(r, CONFIG, 'expected full output', ''), 'OUTPUT_LIMIT_EXCEEDED');
});

test('classification: non-zero exit is RUNTIME_ERROR regardless of stdout content', () => {
  const r = baseRun({ exitCode: 1, stdout: '' });
  assert.equal(classifySingleRun(r, CONFIG, '', ''), 'RUNTIME_ERROR');
});

test('classification: a killing signal is RUNTIME_ERROR even if exitCode is reported as 0', () => {
  const r = baseRun({ exitCode: 0, signal: 'SIGSEGV' });
  assert.equal(classifySingleRun(r, CONFIG, 'x', ''), 'RUNTIME_ERROR');
});

test('classification: clean exit + matching output is ACCEPTED', () => {
  const r = baseRun({ exitCode: 0, stdout: '42\n' });
  assert.equal(classifySingleRun(r, CONFIG, '42', ''), 'ACCEPTED');
});

test('classification: clean exit + non-matching output is WRONG_ANSWER', () => {
  const r = baseRun({ exitCode: 0, stdout: '41\n' });
  assert.equal(classifySingleRun(r, CONFIG, '42', ''), 'WRONG_ANSWER');
});

test('worstVerdict picks the single most severe verdict from a mixed set', () => {
  assert.equal(worstVerdict(['ACCEPTED', 'WRONG_ANSWER', 'ACCEPTED']), 'WRONG_ANSWER');
  assert.equal(worstVerdict(['WRONG_ANSWER', 'TIME_LIMIT_EXCEEDED']), 'TIME_LIMIT_EXCEEDED');
  assert.equal(worstVerdict(['TIME_LIMIT_EXCEEDED', 'RUNTIME_ERROR']), 'RUNTIME_ERROR', 'runtime error outranks timeout');
  assert.equal(worstVerdict(['ACCEPTED', 'ACCEPTED']), 'ACCEPTED');
  assert.equal(worstVerdict([]), 'ACCEPTED');
});

test('buildPublicResult correctly counts passed/failed and preserves per-case detail', () => {
  const result = buildPublicResult([
    { name: 'case1', verdict: 'ACCEPTED', wallMs: 5 },
    { name: 'case2', verdict: 'WRONG_ANSWER', wallMs: 6 },
    { name: 'case3', verdict: 'ACCEPTED', wallMs: 4 },
  ]);
  assert.equal(result.totalTests, 3);
  assert.equal(result.passed, 2);
  assert.equal(result.failed, 1);
  assert.equal(result.cases[1]!.passed, false);
});

test('buildHiddenResult is aggregate-only — the return type has no field for case-level detail', () => {
  const result = buildHiddenResult([
    { weight: 30, allCasesPassed: true },
    { weight: 30, allCasesPassed: true },
    { weight: 40, allCasesPassed: false },
  ]);
  assert.equal(result.totalGroups, 3);
  assert.equal(result.passedGroups, 2);
  assert.equal(result.totalWeight, 100);
  assert.equal(result.earnedWeight, 60);
  assert.deepEqual(Object.keys(result).sort(), ['earnedWeight', 'passedGroups', 'totalGroups', 'totalWeight']);
});

test('computeScore: weighted by hidden groups when present', () => {
  const hidden = buildHiddenResult([{ weight: 50, allCasesPassed: true }, { weight: 50, allCasesPassed: false }]);
  const publicResult = buildPublicResult([{ name: 'c1', verdict: 'ACCEPTED', wallMs: 1 }]);
  assert.equal(computeScore(hidden, publicResult), 50);
});

test('computeScore: falls back to public-test ratio when there are no hidden groups (e.g. practice mode)', () => {
  const hidden = buildHiddenResult([]);
  const publicResult = buildPublicResult([
    { name: 'c1', verdict: 'ACCEPTED', wallMs: 1 },
    { name: 'c2', verdict: 'ACCEPTED', wallMs: 1 },
    { name: 'c3', verdict: 'WRONG_ANSWER', wallMs: 1 },
  ]);
  assert.equal(computeScore(hidden, publicResult), Math.round((2 / 3) * 10000) / 100);
});

test('computeScore: zero tests of any kind scores zero, never NaN or undefined', () => {
  const hidden = buildHiddenResult([]);
  const publicResult = buildPublicResult([]);
  assert.equal(computeScore(hidden, publicResult), 0);
});

test('overall verdict: a failed compilation overrides everything else, even if somehow test verdicts were also computed', () => {
  const verdict = determineOverallVerdict({ compilationStatus: 'FAILED', publicCaseVerdicts: ['ACCEPTED'], hiddenCaseVerdicts: ['ACCEPTED'] });
  assert.equal(verdict, 'COMPILATION_ERROR');
});

test('overall verdict: all-accepted across public and hidden is ACCEPTED', () => {
  const verdict = determineOverallVerdict({ compilationStatus: 'SUCCESS', publicCaseVerdicts: ['ACCEPTED', 'ACCEPTED'], hiddenCaseVerdicts: ['ACCEPTED'] });
  assert.equal(verdict, 'ACCEPTED');
});

test('overall verdict: a single hidden-case failure is enough to flip the whole submission, even with all public cases passing', () => {
  const verdict = determineOverallVerdict({ compilationStatus: 'SUCCESS', publicCaseVerdicts: ['ACCEPTED', 'ACCEPTED'], hiddenCaseVerdicts: ['ACCEPTED', 'WRONG_ANSWER'] });
  assert.equal(verdict, 'WRONG_ANSWER');
});

await run('resultAggregation.test.ts');
