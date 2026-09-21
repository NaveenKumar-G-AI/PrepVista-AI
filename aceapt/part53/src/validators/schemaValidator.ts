import { QuestionVersion } from '../types/domain.js';
import { IssueSeverity, IssueType } from '../types/enums.js';
import { makeIssue, ValidatorOutcome } from './types.js';

/**
 * Deterministic, cheap, always-run-first structural validation (section 14: "required fields,
 * valid options, state transitions"). Everything here is CRITICAL because a structurally broken
 * question can't be safely evaluated by any later validator in the pipeline.
 */
export function validateSchema(version: QuestionVersion): ValidatorOutcome {
  const issues = [];

  if (!version.content || version.content.trim().length === 0) {
    issues.push(makeIssue(IssueType.SCHEMA_INVALID, IssueSeverity.CRITICAL, 'Question stem is empty.'));
  }

  if (!Array.isArray(version.options) || version.options.length < 2) {
    issues.push(
      makeIssue(IssueType.SCHEMA_INVALID, IssueSeverity.CRITICAL, 'At least two options are required.'),
    );
  } else {
    const ids = version.options.map((o) => o.id);
    const dupIds = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
    if (dupIds.length > 0) {
      issues.push(
        makeIssue(
          IssueType.SCHEMA_INVALID,
          IssueSeverity.CRITICAL,
          `Duplicate option ids: ${dupIds.join(', ')}.`,
        ),
      );
    }
    for (const opt of version.options) {
      if (!opt.text || opt.text.trim().length === 0) {
        issues.push(
          makeIssue(IssueType.SCHEMA_INVALID, IssueSeverity.CRITICAL, `Option ${opt.id} has empty text.`),
        );
      }
    }
  }

  if (!Array.isArray(version.answerKey) || version.answerKey.length === 0) {
    issues.push(
      makeIssue(IssueType.SCHEMA_INVALID, IssueSeverity.CRITICAL, 'answerKey must reference at least one option id.'),
    );
  } else if (Array.isArray(version.options)) {
    const validIds = new Set(version.options.map((o) => o.id));
    const invalidRefs = version.answerKey.filter((id) => !validIds.has(id));
    if (invalidRefs.length > 0) {
      issues.push(
        makeIssue(
          IssueType.SCHEMA_INVALID,
          IssueSeverity.CRITICAL,
          `answerKey references option id(s) that don't exist: ${invalidRefs.join(', ')}.`,
        ),
      );
    }
  }

  if (!version.purpose) {
    issues.push(
      makeIssue(
        IssueType.SCHEMA_INVALID,
        IssueSeverity.LOW,
        'No purpose set (section 43) — purpose-aware review strictness cannot be applied correctly.',
      ),
    );
  }

  return { issues };
}
