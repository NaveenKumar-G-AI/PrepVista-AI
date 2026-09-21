import { describe, expect, it } from 'vitest';
import { computeAnswerPositionDistribution, computeCurriculumCoverage } from '../src/services/poolAnalyticsService.js';
import { baseVersion } from './fixtures.js';

describe('computeAnswerPositionDistribution — section 31', () => {
  it('flags an unbalanced pool where the correct answer is always in the same slot', () => {
    const versions = Array.from({ length: 10 }, () =>
      baseVersion({
        options: [
          { id: 'A', text: '1' },
          { id: 'B', text: '2' },
          { id: 'C', text: '3' },
        ],
        answerKey: ['A'], // always slot 0
        multiSelect: false,
      }),
    );
    const { balanced, distribution } = computeAnswerPositionDistribution(versions);
    expect(balanced).toBe(false);
    expect(distribution[0]).toBe(10);
  });

  it('reports balanced when the correct answer is evenly spread across slots', () => {
    const slots = ['A', 'B', 'C'];
    const versions = Array.from({ length: 12 }, (_, i) =>
      baseVersion({
        options: [
          { id: 'A', text: '1' },
          { id: 'B', text: '2' },
          { id: 'C', text: '3' },
        ],
        answerKey: [slots[i % 3]],
        multiSelect: false,
      }),
    );
    const { balanced } = computeAnswerPositionDistribution(versions);
    expect(balanced).toBe(true);
  });

  it('does not include multi-select items in position-bias counting', () => {
    const versions = [baseVersion({ answerKey: ['A', 'B'], multiSelect: true })];
    const { distribution } = computeAnswerPositionDistribution(versions);
    expect(Object.keys(distribution)).toHaveLength(0);
  });
});

describe('computeCurriculumCoverage — section 92', () => {
  it('flags a subskill with too few questions as a coverage gap', () => {
    const versions = [
      ...Array.from({ length: 40 }, () => baseVersion({ skillMapping: { primarySkill: 'PROBABILITY', subskill: 'BASIC' } })),
      ...Array.from({ length: 4 }, () => baseVersion({ skillMapping: { primarySkill: 'PROBABILITY', subskill: 'CONDITIONAL' } })),
    ];
    const coverage = computeCurriculumCoverage(versions, 5);
    const conditional = coverage.find((c) => c.subskill === 'CONDITIONAL');
    const basic = coverage.find((c) => c.subskill === 'BASIC');
    expect(conditional?.gap).toBe(true);
    expect(basic?.gap).toBe(false);
  });
});
