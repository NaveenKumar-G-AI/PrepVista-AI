import { describe, expect, it } from 'vitest';
import { determineQualityStatus } from '../src/validators/pipeline.js';
import { makeIssue } from '../src/validators/types.js';
import { evaluateSafeExpression } from '../src/utils/safeMath.js';
import { IssueSeverity, IssueType, QualityStatus } from '../src/types/enums.js';

describe('determineQualityStatus — pure severity -> status mapping (sections 11-12, 75-76)', () => {
  it('returns PASS for an empty issue list', () => {
    expect(determineQualityStatus([])).toBe(QualityStatus.PASS);
  });

  it('returns BLOCKED if any issue is CRITICAL, regardless of what else is present', () => {
    const issues = [
      makeIssue(IssueType.OTHER, IssueSeverity.LOW, 'minor'),
      makeIssue(IssueType.ANSWER_MISMATCH, IssueSeverity.CRITICAL, 'fatal'),
    ];
    expect(determineQualityStatus(issues)).toBe(QualityStatus.BLOCKED);
  });

  it('returns NEEDS_REVIEW for MEDIUM/HIGH issues with no CRITICAL', () => {
    expect(determineQualityStatus([makeIssue(IssueType.SKILL_MISMATCH, IssueSeverity.MEDIUM, 'x')])).toBe(
      QualityStatus.NEEDS_REVIEW,
    );
  });

  it('returns PASS_WITH_WARNING for LOW-only issues', () => {
    expect(determineQualityStatus([makeIssue(IssueType.AMBIGUOUS, IssueSeverity.LOW, 'x')])).toBe(
      QualityStatus.PASS_WITH_WARNING,
    );
  });

  it('ignores RESOLVED issues when computing status', () => {
    const resolved = { ...makeIssue(IssueType.ANSWER_MISMATCH, IssueSeverity.CRITICAL, 'was fatal'), status: 'RESOLVED' as const };
    expect(determineQualityStatus([resolved])).toBe(QualityStatus.PASS);
  });

  it('INFO-only issues do not even trigger PASS_WITH_WARNING', () => {
    expect(determineQualityStatus([makeIssue(IssueType.VALIDATION_UNAVAILABLE, IssueSeverity.INFO, 'x')])).toBe(
      QualityStatus.PASS,
    );
  });
});

describe('evaluateSafeExpression — no eval()/Function(), question content is untrusted (section 87/132)', () => {
  it('evaluates basic arithmetic with correct precedence', () => {
    expect(evaluateSafeExpression('2 + 3 * 4')).toBe(14);
    expect(evaluateSafeExpression('(2 + 3) * 4')).toBe(20);
  });

  it('supports variables', () => {
    expect(evaluateSafeExpression('distance / speed', { distance: 100, speed: 20 })).toBe(5);
  });

  it('right-associates exponentiation', () => {
    expect(evaluateSafeExpression('2 ^ 3 ^ 2')).toBe(512); // 2^(3^2), not (2^3)^2
  });

  it('throws on unknown variables instead of silently returning NaN/0', () => {
    expect(() => evaluateSafeExpression('x + 1', {})).toThrow();
  });

  it('throws on division by zero instead of returning Infinity', () => {
    expect(() => evaluateSafeExpression('5 / 0')).toThrow();
  });

  it('cannot execute arbitrary JS even if given a string designed to try', () => {
    // If this were eval(), this would run a side effect / throw a totally different error.
    expect(() => evaluateSafeExpression('require("child_process")')).toThrow();
    expect(() => evaluateSafeExpression('(() => { global.pwned = true })()')).toThrow();
  });
});
