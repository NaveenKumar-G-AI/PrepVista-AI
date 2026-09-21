import { describe, expect, it } from 'vitest';
import { validateDifficulty } from '../src/validators/difficultyValidator.js';
import { IssueSeverity, IssueType } from '../src/types/enums.js';
import { baseVersion } from './fixtures.js';

describe('DifficultyValidator — section 47/151', () => {
  it('flags a difficulty anomaly when observed accuracy contradicts the label', () => {
    const v = baseVersion({ difficultyMetadata: { label: 'EASY' } });
    const { issues } = validateDifficulty(v, { accuracyRate: 0.2, sampleSize: 250 });
    const anomaly = issues.find((i) => i.type === IssueType.DIFFICULTY_ANOMALY);
    expect(anomaly).toBeTruthy();
    // Section 47: "Do not automatically rewrite difficulty" / never a hard block on its own.
    expect(anomaly?.severity).not.toBe(IssueSeverity.CRITICAL);
  });

  it('section 51: does not flag when the sample size is too small to trust', () => {
    const v = baseVersion({ difficultyMetadata: { label: 'EASY' } });
    const { issues } = validateDifficulty(v, { accuracyRate: 0.2, sampleSize: 5 });
    expect(issues.some((i) => i.type === IssueType.DIFFICULTY_ANOMALY)).toBe(false);
  });

  it('does not flag when there is no historical data yet', () => {
    const v = baseVersion({ difficultyMetadata: { label: 'HARD' } });
    const { issues } = validateDifficulty(v, undefined);
    expect(issues).toHaveLength(0);
  });

  it('does not flag when accuracy sits comfortably inside the labeled band', () => {
    const v = baseVersion({ difficultyMetadata: { label: 'MEDIUM' } });
    const { issues } = validateDifficulty(v, { accuracyRate: 0.55, sampleSize: 100 });
    expect(issues.some((i) => i.type === IssueType.DIFFICULTY_ANOMALY)).toBe(false);
  });

  it('flags a missing/invalid difficulty label', () => {
    const v = baseVersion({ difficultyMetadata: undefined });
    const { issues } = validateDifficulty(v);
    expect(issues.some((i) => i.type === IssueType.SCHEMA_INVALID)).toBe(true);
  });
});
