import { describe, expect, it } from 'vitest';
import { EnduranceAnalyzer } from '../src/services/enduranceAnalyzer';
import { PerformanceCurveAnalyzer } from '../src/services/performanceCurveAnalyzer';
import { AnswerRecord } from '../src/domain/types';

const endurance = new EnduranceAnalyzer();
const curveAnalyzer = new PerformanceCurveAnalyzer();

function record(isCorrect: boolean): AnswerRecord {
  return {
    questionId: 'q',
    selectedOptionId: 'a',
    previousOptionIds: [],
    isCorrect,
    firstOpenedAt: 0,
    answeredAt: 0,
    timeSpentSeconds: 40,
    skipped: false,
    returned: false,
    remainingTimeFractionAtAnswer: 0.5,
  };
}

describe('EnduranceAnalyzer', () => {
  it('flags ENDURANCE_DECLINE when accuracy drops sharply from beginning to end (spec worked example)', () => {
    // Mirrors spec section 22: beginning ~89%, middle ~83%, end ~64%.
    const beginning = [...Array(9).fill(true), false].map((v) => record(v as boolean));
    const middle = [...Array(8).fill(true), ...Array(2).fill(false)].map((v) => record(v as boolean));
    const end = [...Array(6).fill(true), ...Array(4).fill(false)].map((v) => record(v as boolean));
    const answers = [...beginning, ...middle, ...end];

    const curve = curveAnalyzer.curve(answers);
    const finding = endurance.analyze(curve);

    expect(finding.status).toBe('ENDURANCE_DECLINE');
    expect(finding.accuracyDropPoints).toBeGreaterThan(15);
    expect(finding.confidence).toBeGreaterThan(0);
    expect(endurance.score(finding)).toBeLessThan(100);
  });

  it('reports ENDURANCE_STABLE when accuracy holds steady throughout', () => {
    const answers = Array(24)
      .fill(null)
      .map((_, i) => record(i % 5 !== 0)); // steady ~80% throughout

    const curve = curveAnalyzer.curve(answers);
    const finding = endurance.analyze(curve);

    expect(finding.status).toBe('ENDURANCE_STABLE');
    expect(endurance.score(finding)).toBe(100);
  });
});
