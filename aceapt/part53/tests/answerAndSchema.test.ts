import { describe, expect, it } from 'vitest';
import { validateAnswer } from '../src/validators/answerValidator.js';
import { validateSchema } from '../src/validators/schemaValidator.js';
import { IssueSeverity, IssueType } from '../src/types/enums.js';
import { baseVersion } from './fixtures.js';

describe('SchemaValidator', () => {
  it('flags fewer than two options', () => {
    const v = baseVersion({ options: [{ id: 'A', text: 'Only one' }], answerKey: ['A'] });
    const { issues } = validateSchema(v);
    expect(issues.some((i) => i.type === IssueType.SCHEMA_INVALID && i.severity === IssueSeverity.CRITICAL)).toBe(true);
  });

  it('flags an answerKey that references a non-existent option', () => {
    const v = baseVersion({ answerKey: ['Z'] });
    const { issues } = validateSchema(v);
    expect(issues.some((i) => i.type === IssueType.SCHEMA_INVALID)).toBe(true);
  });

  it('passes a well-formed question', () => {
    const v = baseVersion();
    const { issues } = validateSchema(v);
    expect(issues.filter((i) => i.severity === IssueSeverity.CRITICAL)).toHaveLength(0);
  });
});

describe('AnswerValidator — section 19/144: "20% of 500" worked example', () => {
  it('BLOCKS when the stored answer key does not match the independent calculation', () => {
    const v = baseVersion({
      content: 'What is 20% of 500?',
      options: [
        { id: 'A', text: '100', numericValue: 100 },
        { id: 'B', text: '125', numericValue: 125 },
        { id: 'C', text: '90', numericValue: 90 },
      ],
      answerKey: ['B'], // author claims 125
      computation: { kind: 'PERCENTAGE_OF', percent: 20, of: 500 }, // independently: 100
    });
    const { issues } = validateAnswer(v);
    const mismatch = issues.find((i) => i.type === IssueType.ANSWER_MISMATCH);
    expect(mismatch).toBeTruthy();
    expect(mismatch?.severity).toBe(IssueSeverity.CRITICAL);
  });

  it('passes when the stored answer matches the independent calculation', () => {
    const v = baseVersion({
      options: [
        { id: 'A', text: '100', numericValue: 100 },
        { id: 'B', text: '125', numericValue: 125 },
      ],
      answerKey: ['A'],
      computation: { kind: 'PERCENTAGE_OF', percent: 20, of: 500 },
    });
    const { issues } = validateAnswer(v);
    expect(issues.filter((i) => i.severity === IssueSeverity.CRITICAL)).toHaveLength(0);
  });
});

describe('AnswerValidator — section 146: no valid option', () => {
  it('BLOCKS when no option matches the independently computed answer', () => {
    const v = baseVersion({
      options: [
        { id: 'A', text: '40', numericValue: 40 },
        { id: 'B', text: '60', numericValue: 60 },
      ],
      answerKey: ['A'],
      computation: { kind: 'PERCENTAGE_OF', percent: 20, of: 500 }, // = 100, matches nothing
    });
    const { issues } = validateAnswer(v);
    const issue = issues.find((i) => i.type === IssueType.NO_VALID_OPTION);
    expect(issue).toBeTruthy();
    expect(issue?.severity).toBe(IssueSeverity.CRITICAL);
  });
});

describe('AnswerValidator — section 26/145: multiple valid answers on a single-select item', () => {
  it('BLOCKS when the independent calculation matches more than one option and multiSelect is false', () => {
    const v = baseVersion({
      options: [
        { id: 'A', text: '100', numericValue: 100 },
        { id: 'B', text: '100.001', numericValue: 100.001 }, // within tolerance of A
        { id: 'C', text: '90', numericValue: 90 },
      ],
      answerKey: ['A'],
      multiSelect: false,
      computation: { kind: 'PERCENTAGE_OF', percent: 20, of: 500 },
    });
    const { issues } = validateAnswer(v);
    expect(issues.some((i) => i.type === IssueType.MULTIPLE_VALID && i.severity === IssueSeverity.CRITICAL)).toBe(true);
  });

  it('section 27: does NOT flag multiple correct options when multiSelect is explicitly true', () => {
    const v = baseVersion({
      options: [
        { id: 'A', text: '2', numericValue: 2 },
        { id: 'B', text: '3', numericValue: 3 },
        { id: 'C', text: '4', numericValue: 4 },
      ],
      answerKey: ['A', 'B'],
      multiSelect: true,
    });
    const { issues } = validateAnswer(v);
    expect(issues.some((i) => i.type === IssueType.MULTIPLE_VALID)).toBe(false);
  });
});

describe('AnswerValidator — section 22: probability bounds', () => {
  it('flags a computed probability outside [0, 1] as a critical schema problem', () => {
    const v = baseVersion({
      options: [
        { id: 'A', text: '1.2', numericValue: 1.2 },
        { id: 'B', text: '0.5', numericValue: 0.5 },
      ],
      answerKey: ['A'],
      computation: { kind: 'PROBABILITY', favorable: 6, total: 5 }, // malformed on purpose: 6/5 = 1.2
    });
    const { issues } = validateAnswer(v);
    expect(issues.some((i) => i.severity === IssueSeverity.CRITICAL)).toBe(true);
  });
});
