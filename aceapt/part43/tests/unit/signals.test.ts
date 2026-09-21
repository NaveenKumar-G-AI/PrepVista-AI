import { detectFatigue, initializeCoverage, recordCoverage } from '../../src/engine/signals';
import { ResponseRecord } from '../../src/domain/types';

function response(isCorrect: boolean, responseTimeMs: number): ResponseRecord {
  return { id: 'r', sessionId: 's', questionId: 'q', skillId: 'sk', difficultyRating: 0, isCorrect, responseTimeMs, answeredAt: new Date().toISOString() };
}

describe('coverage guardrails', () => {
  it('marks a domain satisfied only once its minimum question count is reached', () => {
    let coverage = initializeCoverage({ requiredDomains: ['Quant', 'Verbal'], minQuestionsPerDomain: 2 });
    expect(coverage.Quant.satisfied).toBe(false);
    expect(coverage.Verbal.satisfied).toBe(false);

    coverage = recordCoverage(coverage, 'Quant');
    expect(coverage.Quant.satisfied).toBe(false);
    coverage = recordCoverage(coverage, 'Quant');
    expect(coverage.Quant.satisfied).toBe(true);
    expect(coverage.Verbal.satisfied).toBe(false);
  });

  it('treats a zero minimum as already satisfied', () => {
    const coverage = initializeCoverage({ requiredDomains: ['Quant'], minQuestionsPerDomain: 0 });
    expect(coverage.Quant.satisfied).toBe(true);
  });
});

describe('detectFatigue', () => {
  it('reports no fatigue with too little history', () => {
    const fatigue = detectFatigue({ recentResponses: [response(true, 10000)] });
    expect(fatigue.severity).toBe('none');
  });

  it('flags high severity when response time rises and accuracy drops together (spec sections 40, 81)', () => {
    const recent = [
      response(true, 10000),
      response(true, 11000),
      response(true, 9000),
      response(false, 25000),
      response(false, 27000),
      response(false, 24000),
    ];
    const fatigue = detectFatigue({ recentResponses: recent });
    expect(fatigue.responseTimeTrend).toBe('increasing');
    expect(fatigue.accuracyTrend).toBe('declining');
    expect(fatigue.severity).toBe('high');
    expect(fatigue.recommendPause).toBe(true);
  });

  it('does not flag fatigue when performance is stable', () => {
    const recent = [
      response(true, 10000),
      response(false, 11000),
      response(true, 9000),
      response(true, 10500),
      response(false, 10200),
      response(true, 9800),
    ];
    const fatigue = detectFatigue({ recentResponses: recent });
    expect(fatigue.severity).toBe('none');
    expect(fatigue.recommendPause).toBe(false);
  });
});
