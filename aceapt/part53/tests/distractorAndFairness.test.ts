import { describe, expect, it } from 'vitest';
import { validateDistractors } from '../src/validators/distractorValidator.js';
import { validateFairnessAndAccessibility } from '../src/validators/fairnessAccessibilityValidator.js';
import { IssueType } from '../src/types/enums.js';
import { baseVersion } from './fixtures.js';

describe('DistractorValidator', () => {
  it('flags duplicate numeric option values', () => {
    const v = baseVersion({
      options: [
        { id: 'A', text: '50', numericValue: 50 },
        { id: 'B', text: '50', numericValue: 50 },
        { id: 'C', text: '60', numericValue: 60 },
      ],
    });
    const { issues } = validateDistractors(v);
    expect(issues.some((i) => i.type === IssueType.DISTRACTOR_QUALITY)).toBe(true);
  });

  it('flags too few options', () => {
    const v = baseVersion({ options: [{ id: 'A', text: '1' }, { id: 'B', text: '2' }], minOptions: 4 });
    const { issues } = validateDistractors(v);
    expect(issues.some((i) => i.type === IssueType.DISTRACTOR_QUALITY)).toBe(true);
  });

  it('flags a trivially-eliminated negative value when nonNegativeExpected is set', () => {
    const v = baseVersion({
      options: [
        { id: 'A', text: '5', numericValue: 5 },
        { id: 'B', text: '-3', numericValue: -3 },
        { id: 'C', text: '8', numericValue: 8 },
      ],
      nonNegativeExpected: true,
    });
    const { issues } = validateDistractors(v);
    expect(issues.some((i) => i.type === IssueType.DISTRACTOR_QUALITY)).toBe(true);
  });

  it('passes clean, distinct options', () => {
    const v = baseVersion();
    const { issues } = validateDistractors(v);
    expect(issues).toHaveLength(0);
  });
});

describe('FairnessAccessibilityValidator', () => {
  it('flags a diagram with no altText', () => {
    const v = baseVersion({ diagram: { url: 'https://example.com/diagram.png' } });
    const { issues } = validateFairnessAndAccessibility(v);
    expect(issues.some((i) => i.type === IssueType.ACCESSIBILITY_CONCERN)).toBe(true);
  });

  it('does not flag a diagram that has altText', () => {
    const v = baseVersion({ diagram: { url: 'https://example.com/diagram.png', altText: 'A right triangle with legs 3 and 4.' } });
    const { issues } = validateFairnessAndAccessibility(v);
    expect(issues.some((i) => i.type === IssueType.ACCESSIBILITY_CONCERN)).toBe(false);
  });

  it('flags a correct option that is conspicuously longer than the distractors', () => {
    const v = baseVersion({
      options: [
        {
          id: 'A',
          text: 'This is the unusually long and detailed correct explanation option that stands out immediately to any test-savvy reader',
        },
        { id: 'B', text: 'Short one' },
        { id: 'C', text: 'Short two' },
      ],
      answerKey: ['A'],
    });
    const { issues } = validateFairnessAndAccessibility(v);
    expect(issues.some((i) => i.type === IssueType.FAIRNESS_CONCERN)).toBe(true);
  });

  it('flags absolute terms appearing only in distractors', () => {
    const v = baseVersion({
      options: [
        { id: 'A', text: 'Sometimes true depending on conditions' },
        { id: 'B', text: 'This is always the case' },
        { id: 'C', text: 'This is never the case' },
      ],
      answerKey: ['A'],
    });
    const { issues } = validateFairnessAndAccessibility(v);
    expect(issues.some((i) => i.type === IssueType.FAIRNESS_CONCERN)).toBe(true);
  });
});
