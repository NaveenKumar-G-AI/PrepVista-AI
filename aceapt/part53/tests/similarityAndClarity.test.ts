import { describe, expect, it } from 'vitest';
import { validateClarity } from '../src/validators/clarityValidator.js';
import { validateSimilarity } from '../src/validators/similarityValidator.js';
import { IssueSeverity, IssueType } from '../src/types/enums.js';
import { baseVersion } from './fixtures.js';

describe('SimilarityValidator — section 149: duplicate detection', () => {
  it('flags an exact normalized duplicate regardless of casing/whitespace', () => {
    const a = baseVersion({ questionId: 'q1', content: 'What is 20% of 500?' });
    const b = baseVersion({ questionId: 'q2', content: '  WHAT is 20% of   500?  ' });
    const { issues } = validateSimilarity(a, [b]);
    expect(issues.some((i) => i.type === IssueType.STRUCTURAL_DUPLICATE && i.severity === IssueSeverity.HIGH)).toBe(true);
  });

  it('flags a near-duplicate below the exact-hash threshold via Jaccard similarity', () => {
    const a = baseVersion({
      questionId: 'q1',
      content: 'A sum of 1000 is invested at 10 percent simple interest per annum for 2 years, find the interest.',
    });
    const b = baseVersion({
      questionId: 'q2',
      content: 'A sum of 1000 is invested at 10 percent simple interest per annum for 2 years, find the interest amount.',
    });
    const { issues } = validateSimilarity(a, [b]);
    expect(issues.some((i) => i.type === IssueType.STRUCTURAL_DUPLICATE)).toBe(true);
  });

  it('does not flag genuinely different questions', () => {
    const a = baseVersion({ questionId: 'q1', content: 'What is 20% of 500?' });
    const b = baseVersion({ questionId: 'q2', content: 'A train crosses a 200m platform in 30 seconds at what speed?' });
    const { issues } = validateSimilarity(a, [b]);
    expect(issues).toHaveLength(0);
  });

  it('section 167/94: flags structural pool over-representation once enough share the same signature', () => {
    const target = baseVersion({
      questionId: 'target',
      content: 'Totally unique wording goes here for the target question',
      skillMapping: { primarySkill: 'PERCENTAGE' },
      computation: { kind: 'PERCENTAGE_OF', percent: 10, of: 100 },
    });
    const pool = Array.from({ length: 6 }, (_, i) =>
      baseVersion({
        questionId: `p${i}`,
        content: `Entirely distinct sentence variant number ${i} with different words`,
        skillMapping: { primarySkill: 'PERCENTAGE' },
        computation: { kind: 'PERCENTAGE_OF', percent: 10 + i, of: 100 },
      }),
    );
    const { issues } = validateSimilarity(target, pool);
    expect(issues.some((i) => i.message.includes('over-representation'))).toBe(true);
  });
});

describe('ClarityValidator — section 34: under-specified questions', () => {
  it('flags a question that lacks enough numeric information to solve', () => {
    const v = baseVersion({
      content: 'A car travels at a constant speed. How long does it take to complete the journey?',
      computation: { kind: 'CUSTOM_EXPRESSION', expression: 'distance / speed', variables: { distance: 100, speed: 20 } },
    });
    const { issues } = validateClarity(v);
    const issue = issues.find((i) => i.type === IssueType.UNDER_SPECIFIED);
    expect(issue).toBeTruthy();
    expect(issue?.severity).toBe(IssueSeverity.HIGH);
  });

  it('does not flag when the stem mentions enough numbers', () => {
    const v = baseVersion({
      content: 'A car travels 100 km at 20 km/h. How long does it take to complete the journey?',
      computation: { kind: 'CUSTOM_EXPRESSION', expression: 'distance / speed', variables: { distance: 100, speed: 20 } },
    });
    const { issues } = validateClarity(v);
    expect(issues.some((i) => i.type === IssueType.UNDER_SPECIFIED)).toBe(false);
  });
});

describe('ClarityValidator — section 35: internal contradiction', () => {
  it('flags a contradiction between the stem and structured context data', () => {
    const v = baseVersion({
      content: 'A bag contains 5 red balls and several blue balls.',
      context: { facts: { 'red balls': 6 } },
    });
    const { issues } = validateClarity(v);
    const issue = issues.find((i) => i.type === IssueType.INTERNAL_CONTRADICTION);
    expect(issue).toBeTruthy();
    expect(issue?.severity).toBe(IssueSeverity.CRITICAL);
  });

  it('does not flag when the stem agrees with the structured data', () => {
    const v = baseVersion({
      content: 'A bag contains 6 red balls and several blue balls.',
      context: { facts: { 'red balls': 6 } },
    });
    const { issues } = validateClarity(v);
    expect(issues.some((i) => i.type === IssueType.INTERNAL_CONTRADICTION)).toBe(false);
  });
});

describe('ClarityValidator — section 150: general ambiguity heuristics stay non-critical', () => {
  it('flags but does not block a stem with multiple question marks', () => {
    const v = baseVersion({ content: 'What is the cost? And how long does delivery take?' });
    const { issues } = validateClarity(v);
    const issue = issues.find((i) => i.type === IssueType.AMBIGUOUS);
    expect(issue).toBeTruthy();
    expect(issue?.severity).toBe(IssueSeverity.LOW);
  });
});
