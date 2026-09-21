import { analyzeSubmission } from '../src/pipeline/analyze';
import { MockProvider } from '../src/ai/mock_provider';
import { AIProvider } from '../src/ai/provider';

const GOOD_PY = `
def calculate_average(values):
    """Return the arithmetic mean of a non-empty list of numbers."""
    if not values:
        raise ValueError("values must not be empty")
    return sum(values) / len(values)
`;

const BAD_PY = `
import os
import json

def do_stuff(a, b, c, d, e, f, g):
    x = 0
    for i in range(1000):
        if a > 0:
            if b > 0:
                if c > 0:
                    try:
                        x = x + a * 7
                    except:
                        pass
    return x
`;

test('identical source produces an identical score across repeated runs (determinism)', async () => {
  const r1 = await analyzeSubmission({ submissionId: 's1', source: BAD_PY, language: 'python' });
  const r2 = await analyzeSubmission({ submissionId: 's2', source: BAD_PY, language: 'python' });
  expect(r1.overallScore).toBe(r2.overallScore);
  expect(r1.dimensionScores).toEqual(r2.dimensionScores);
});

test('clean, documented code scores meaningfully higher than code full of smells', async () => {
  const good = await analyzeSubmission({ submissionId: 'good1', source: GOOD_PY, language: 'python' });
  const bad = await analyzeSubmission({ submissionId: 'bad1', source: BAD_PY, language: 'python' });
  expect(good.overallScore).toBeGreaterThan(bad.overallScore);
  expect(bad.findings.length).toBeGreaterThan(3);
});

test('a second call for the same, not-previously-seen source is served from cache', async () => {
  const UNIQUE_SOURCE = `\ndef unique_marker_${Date.now()}(n):\n    return n * 2\n`;
  const first = await analyzeSubmission({ submissionId: 'cacheA', source: UNIQUE_SOURCE, language: 'python' });
  const second = await analyzeSubmission({ submissionId: 'cacheB', source: UNIQUE_SOURCE, language: 'python' });
  expect(first.cacheHit).toBe(false);
  expect(second.cacheHit).toBe(true);
});

test('an unparseable submission fails safely instead of fabricating a score', async () => {
  const report = await analyzeSubmission({ submissionId: 'broken1', source: 'def broken(:\n    pass', language: 'python' });
  expect(report.overallLabel).toBe('ANALYSIS_FAILED');
  expect(report.findings[0].ruleId).toBe('MalformedSource');
});

test('an unsupported language fails safely', async () => {
  const report = await analyzeSubmission({ submissionId: 'lang1', source: 'puts "hi"', language: 'ruby' as any });
  expect(report.overallLabel).toBe('ANALYSIS_FAILED');
  expect(report.findings[0].ruleId).toBe('UnsupportedLanguage');
});

test('the pipeline survives an AI provider that always throws', async () => {
  const flaky: AIProvider = {
    name: 'flaky',
    interpret: async () => {
      throw new Error('provider down');
    },
  };
  const report = await analyzeSubmission({ submissionId: 'ai-down', source: GOOD_PY, language: 'python' }, { aiProvider: flaky });
  expect(report.aiStatus).toBe('UNAVAILABLE');
  expect(report.overallScore).toBe(100);
});

test('the pipeline survives an AI provider that returns malformed JSON-shaped output', async () => {
  const malformed: AIProvider = {
    name: 'malformed',
    interpret: async () => ({ summary: 42 } as any),
  };
  const report = await analyzeSubmission({ submissionId: 'ai-malformed', source: GOOD_PY, language: 'python' }, { aiProvider: malformed });
  expect(report.aiStatus).toBe('INVALID_RESPONSE');
  expect(report.aiInterpretation).toBeNull();
});

test('before/after comparison reflects a genuine improvement', async () => {
  const before = await analyzeSubmission({ submissionId: 'v1', source: BAD_PY, language: 'python' });
  const after = await analyzeSubmission({ submissionId: 'v2', source: GOOD_PY, language: 'python' }, { previousReport: before });
  expect(after.comparison).not.toBeNull();
  expect(after.comparison!.delta).toBeGreaterThan(0);
});

test('mock AI interpretation is produced end-to-end when a provider is supplied', async () => {
  const report = await analyzeSubmission({ submissionId: 'ai1', source: BAD_PY, language: 'python' }, { aiProvider: new MockProvider() });
  expect(report.aiStatus).toBe('OK');
  expect(report.aiInterpretation).not.toBeNull();
});

test('every report is stamped with the analysis and rule-set versions', async () => {
  const report = await analyzeSubmission({ submissionId: 'v-stamp', source: GOOD_PY, language: 'python' });
  expect(report.analysisVersion).toBeTruthy();
  expect(report.ruleSetVersion).toBeTruthy();
});
