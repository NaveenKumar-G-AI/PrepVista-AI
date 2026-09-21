import { HistoricalStats, Issue, QuestionVersion } from '../types/domain.js';
import { IssueSeverity, IssueType } from '../types/enums.js';
import { makeIssue, ValidatorOutcome } from './types.js';

/** Section 45: "Feature 55 owns empirical difficulty calibration. Feature 53 checks: Is the
 *  initial difficulty claim plausible? Do not replace Feature 55." — so this only flags
 *  implausible claims, it never rewrites `difficultyMetadata` itself. */
const ACCURACY_BANDS: Record<string, [number, number]> = {
  EASY: [0.7, 1.01],
  MEDIUM: [0.4, 0.7],
  HARD: [0, 0.4],
};

// Section 51: "Do not use unreliable statistics with tiny sample sizes."
const MIN_SAMPLE_SIZE = 30;

export function validateDifficulty(version: QuestionVersion, historicalStats?: HistoricalStats): ValidatorOutcome {
  const issues: Issue[] = [];
  const label = version.difficultyMetadata?.label;

  if (!label || !(label in ACCURACY_BANDS)) {
    issues.push(makeIssue(IssueType.SCHEMA_INVALID, IssueSeverity.MEDIUM, 'Missing or invalid difficulty label.'));
    return { issues };
  }

  if (!historicalStats || historicalStats.sampleSize < MIN_SAMPLE_SIZE) {
    return { issues }; // not enough real usage data yet — author/AI estimate stands unchallenged
  }

  const [lo, hi] = ACCURACY_BANDS[label];
  if (historicalStats.accuracyRate < lo || historicalStats.accuracyRate >= hi) {
    // Section 47/151: flag, never auto-rewrite, never auto-reject solely for this.
    issues.push(
      makeIssue(
        IssueType.DIFFICULTY_ANOMALY,
        IssueSeverity.MEDIUM,
        `Labeled ${label}, but observed accuracy over ${historicalStats.sampleSize} attempts is ` +
          `${(historicalStats.accuracyRate * 100).toFixed(1)}%, outside the expected ${(lo * 100).toFixed(
            0,
          )}-${(hi * 100).toFixed(0)}% band. Possible causes per section 49: bad question, extreme concept ` +
          'difficulty, incorrect key, or unclear wording — investigate, do not auto-relabel.',
        { label, ...historicalStats },
      ),
    );
  }

  return { issues };
}
