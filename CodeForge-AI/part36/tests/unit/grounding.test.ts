import { describe, it, expect } from 'vitest';
import { checkGrounding } from '../../src/ai/groundingCheck';

describe('checkGrounding', () => {
  const structuredInput = {
    strongestAreas: ['Python'],
    priorityGaps: ['SQL'],
    evidenceCoverageSummary: { Python: 'HIGH', SQL: 'INSUFFICIENT' },
    trainingPriorities: ['SQL + Database Optimization'],
  };

  it('passes when the text makes no numeric claims beyond what is in the structured input', () => {
    const text = 'The cohort shows strength in Python, with SQL flagged as a priority gap.';
    expect(checkGrounding(text, structuredInput).grounded).toBe(true);
  });

  it('fails when the model invents a percentage not present in the data (section 55)', () => {
    const text = 'Python proficiency improved by 27% this quarter.';
    const result = checkGrounding(text, structuredInput);
    expect(result.grounded).toBe(false);
    expect(result.ungroundedTokens).toContain('27%');
  });

  it('does not false-flag numbers that genuinely came from the input', () => {
    const input = { affectedStudents: 42 };
    const text = 'This gap affects 42 students.';
    expect(checkGrounding(text, input).grounded).toBe(true);
  });
});
