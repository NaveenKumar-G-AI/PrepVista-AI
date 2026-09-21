import { describe, expect, it } from 'vitest';
import { validateSkillAlignment } from '../src/validators/skillAlignmentValidator.js';
import { validateSolution } from '../src/validators/solutionValidator.js';
import { IssueSeverity, IssueType } from '../src/types/enums.js';
import { baseVersion } from './fixtures.js';

describe('SolutionValidator — section 64/147: solution must agree with the stored answer', () => {
  it('BLOCKS when a structured derived value disagrees with the marked-correct option', () => {
    const v = baseVersion({
      options: [
        { id: 'A', text: '20%', numericValue: 20 },
        { id: 'B', text: '25%', numericValue: 25 },
      ],
      answerKey: ['A'], // 20% marked correct
      solution: { derivedValue: 25 }, // but the written solution works out to 25%
    });
    const { issues } = validateSolution(v);
    const mismatch = issues.find((i) => i.type === IssueType.SOLUTION_MISMATCH);
    expect(mismatch).toBeTruthy();
    expect(mismatch?.severity).toBe(IssueSeverity.CRITICAL);
  });

  it('passes when the solution agrees with the answer', () => {
    const v = baseVersion({
      options: [{ id: 'A', text: '20%', numericValue: 20 }],
      answerKey: ['A'],
      solution: { derivedValue: 20 },
    });
    const { issues } = validateSolution(v);
    expect(issues).toHaveLength(0);
  });

  it('treats a heuristically-extracted free-text value as MEDIUM, not CRITICAL', () => {
    const v = baseVersion({
      options: [{ id: 'A', text: '20', numericValue: 20 }],
      answerKey: ['A'],
      solution: { text: 'Working it out step by step, the final result = 25' },
    });
    const { issues } = validateSolution(v);
    const mismatch = issues.find((i) => i.type === IssueType.SOLUTION_MISMATCH);
    expect(mismatch?.severity).toBe(IssueSeverity.MEDIUM);
  });

  it('does nothing when there is no solution to check', () => {
    const v = baseVersion({ solution: undefined });
    const { issues } = validateSolution(v);
    expect(issues).toHaveLength(0);
  });
});

describe('SkillAlignmentValidator — section 40/148', () => {
  it('flags a tagged skill that does not match the detected computation type', () => {
    const v = baseVersion({
      skillMapping: { primarySkill: 'PROBABILITY' },
      computation: { kind: 'RATIO_SHARE', total: 100, ratio: [2, 3], shareIndex: 0 },
    });
    const { issues } = validateSkillAlignment(v);
    const mismatch = issues.find((i) => i.type === IssueType.SKILL_MISMATCH);
    expect(mismatch).toBeTruthy();
    // Section 148: this is a FLAG, never an auto-block.
    expect(mismatch?.severity).not.toBe(IssueSeverity.CRITICAL);
  });

  it('does not flag when the tag matches the fallback hint table', () => {
    const v = baseVersion({
      skillMapping: { primarySkill: 'PERCENTAGE' },
      computation: { kind: 'PERCENTAGE_OF', percent: 10, of: 100 },
    });
    const { issues } = validateSkillAlignment(v);
    expect(issues.some((i) => i.type === IssueType.SKILL_MISMATCH)).toBe(false);
  });

  it('defers to a connected SkillGraphPort over the built-in fallback table', () => {
    const v = baseVersion({
      skillMapping: { primarySkill: 'ANYTHING_AT_ALL' },
      computation: { kind: 'RATIO_SHARE', total: 100, ratio: [2, 3], shareIndex: 0 },
    });
    const port = { isSkillValidForComputation: () => true };
    const { issues } = validateSkillAlignment(v, port);
    expect(issues.some((i) => i.type === IssueType.SKILL_MISMATCH)).toBe(false);
  });

  it('flags a missing primary skill', () => {
    const v = baseVersion({ skillMapping: undefined });
    const { issues } = validateSkillAlignment(v);
    expect(issues.some((i) => i.type === IssueType.SCHEMA_INVALID)).toBe(true);
  });
});
