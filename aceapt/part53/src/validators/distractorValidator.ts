import { normalizeText } from '../domain/text.js';
import { isApproximatelyEqual } from '../utils/misc.js';
import { Issue, QuestionVersion } from '../types/domain.js';
import { IssueSeverity, IssueType } from '../types/enums.js';
import { makeIssue, ValidatorOutcome } from './types.js';

export function validateDistractors(version: QuestionVersion): ValidatorOutcome {
  const issues: Issue[] = [];
  const options = version.options ?? [];
  if (options.length === 0) return { issues };

  // Duplicate wording (section 30: "duplicate options").
  const textGroups = new Map<string, string[]>();
  for (const opt of options) {
    const norm = normalizeText(opt.text ?? '');
    if (!norm) continue;
    textGroups.set(norm, [...(textGroups.get(norm) ?? []), opt.id]);
  }
  for (const [text, ids] of textGroups) {
    if (ids.length > 1) {
      issues.push(
        makeIssue(
          IssueType.DISTRACTOR_QUALITY,
          IssueSeverity.HIGH,
          `${ids.length} options share identical wording ("${text}"): ${ids.join(', ')}.`,
        ),
      );
    }
  }

  // Duplicate / equivalent numeric values (section 30: "equivalent options").
  const numericBuckets: { value: number; ids: string[] }[] = [];
  for (const opt of options) {
    if (typeof opt.numericValue !== 'number') continue;
    const bucket = numericBuckets.find((b) => isApproximatelyEqual(b.value, opt.numericValue!));
    if (bucket) bucket.ids.push(opt.id);
    else numericBuckets.push({ value: opt.numericValue, ids: [opt.id] });
  }
  for (const bucket of numericBuckets) {
    if (bucket.ids.length > 1) {
      issues.push(
        makeIssue(
          IssueType.DISTRACTOR_QUALITY,
          IssueSeverity.HIGH,
          `${bucket.ids.length} options share the same numeric value (${bucket.value}): ${bucket.ids.join(', ')}.`,
        ),
      );
    }
  }

  const minOptions = version.minOptions ?? 3;
  if (options.length < minOptions) {
    issues.push(
      makeIssue(
        IssueType.DISTRACTOR_QUALITY,
        IssueSeverity.MEDIUM,
        `Only ${options.length} option(s) provided; expected at least ${minOptions}.`,
      ),
    );
  }

  // Trivially-eliminated / absurd options (section 28).
  if (version.nonNegativeExpected) {
    for (const opt of options) {
      if (typeof opt.numericValue === 'number' && opt.numericValue < 0) {
        issues.push(
          makeIssue(
            IssueType.DISTRACTOR_QUALITY,
            IssueSeverity.LOW,
            `Option ${opt.id} has a negative value (${opt.numericValue}), which isn't plausible for this ` +
              'question type and can be trivially eliminated.',
          ),
        );
      }
    }
  }

  return { issues };
}
