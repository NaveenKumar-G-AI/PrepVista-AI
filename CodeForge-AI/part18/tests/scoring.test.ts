import { computeScore } from '../src/scoring/engine';
import { Finding } from '../src/types';

function finding(overrides: Partial<Finding>): Finding {
  return {
    findingId: 'f1',
    ruleId: 'LONG_FUNCTION',
    ruleVersion: '1.0.0',
    category: 'LONG_FUNCTION',
    severity: 'MEDIUM',
    confidence: 'HIGH',
    title: 't',
    description: 'd',
    impact: 'i',
    sourceLocation: null,
    evidence: [],
    suggestedAction: 'a',
    dimensions: { STRUCTURAL_QUALITY: 0.6, READABILITY: 0.4 },
    origin: 'DETERMINISTIC',
    ...overrides,
  };
}

test('scoring is deterministic for identical findings', () => {
  const findings = [finding({}), finding({ findingId: 'f2', ruleId: 'POOR_NAMING', dimensions: { NAMING: 0.8, READABILITY: 0.2 } })];
  const a = computeScore(findings);
  const b = computeScore(findings);
  expect(a.overallScore).toBe(b.overallScore);
  expect(a.dimensionScores).toEqual(b.dimensionScores);
});

test('no findings yields a perfect score', () => {
  const { overallScore, overallLabel } = computeScore([]);
  expect(overallScore).toBe(100);
  expect(overallLabel).toBe('EXCELLENT');
});

test('every deduction is traceable to the finding that caused it', () => {
  const { dimensionScores } = computeScore([finding({})]);
  const structural = dimensionScores.find((d) => d.dimension === 'STRUCTURAL_QUALITY')!;
  expect(structural.score).toBeLessThan(100);
  expect(structural.contributions.length).toBeGreaterThan(0);
  expect(structural.contributions[0].findingId).toBe('f1');
});

test('AI-origin findings never move the deterministic score', () => {
  const { overallScore } = computeScore([finding({ origin: 'AI_SEMANTIC', findingId: 'ai1' })]);
  expect(overallScore).toBe(100);
});

test('CRITICAL severity deducts strictly more than LOW for the same dimension split', () => {
  const low = computeScore([finding({ severity: 'LOW' })]);
  const critical = computeScore([finding({ severity: 'CRITICAL' })]);
  expect(critical.overallScore).toBeLessThan(low.overallScore);
});

test('LOW confidence deducts less than HIGH confidence for an otherwise identical finding', () => {
  const highConf = computeScore([finding({ confidence: 'HIGH' })]);
  const lowConf = computeScore([finding({ confidence: 'LOW' })]);
  expect(lowConf.overallScore).toBeGreaterThan(highConf.overallScore);
});
