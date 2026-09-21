import { computeExpectedValue, ComputationError } from '../domain/computation.js';
import { isApproximatelyEqual } from '../utils/misc.js';
import { Issue, QuestionVersion } from '../types/domain.js';
import { IssueSeverity, IssueType } from '../types/enums.js';
import { makeIssue, ValidatorOutcome } from './types.js';

/**
 * Section 18 pipeline: QUESTION -> CANONICAL ANSWER -> INDEPENDENT SOLVER -> COMPARE -> FLAG if different.
 *
 * When `computation` is present, this is the validator that catches the worked example from
 * section 19 verbatim: "20% of 500" independently computes to 100; if the stored answer key
 * points at an option worth 125, that's an ANSWER_MISMATCH, not a rounding quibble.
 *
 * When `computation` is absent (verbal/RC/pure-logic items with no closed-form answer), this
 * validator only checks schema-level answer-key consistency (does exactly one option carry the
 * key on a single-select item, unless multiSelect is explicitly set — section 26/27).
 */
export function validateAnswer(version: QuestionVersion): ValidatorOutcome {
  const issues: Issue[] = [];
  const options = version.options ?? [];

  if (options.length < 2) {
    // SchemaValidator already reports this; avoid cascading confusing secondary errors.
    return { issues };
  }

  const markedCorrectIds = options.filter((o) => version.answerKey?.includes(o.id)).map((o) => o.id);

  if (markedCorrectIds.length === 0) {
    issues.push(
      makeIssue(IssueType.NO_VALID_OPTION, IssueSeverity.CRITICAL, 'Answer key references no existing option.'),
    );
  }
  if (!version.multiSelect && markedCorrectIds.length > 1) {
    issues.push(
      makeIssue(
        IssueType.MULTIPLE_VALID,
        IssueSeverity.CRITICAL,
        `Single-select question has ${markedCorrectIds.length} options marked correct (${markedCorrectIds.join(', ')}) ` +
          'but multiSelect is not set (section 26/27).',
      ),
    );
  }

  if (!version.computation) {
    return { issues }; // nothing independently verifiable — schema-level checks above are all we can do
  }

  let expected: number;
  try {
    expected = computeExpectedValue(version.computation);
  } catch (err) {
    issues.push(
      makeIssue(
        IssueType.SCHEMA_INVALID,
        IssueSeverity.CRITICAL,
        `Computation spec could not be evaluated: ${err instanceof ComputationError ? err.message : String(err)}`,
      ),
    );
    return { issues };
  }

  if (version.computation.kind === 'PROBABILITY' && (expected < 0 || expected > 1)) {
    // Section 22: "0 <= P <= 1"
    issues.push(
      makeIssue(
        IssueType.SCHEMA_INVALID,
        IssueSeverity.CRITICAL,
        `Computed probability ${expected} is outside the valid range [0, 1].`,
      ),
    );
  }

  const computedCorrectIds = options
    .filter((o) => typeof o.numericValue === 'number' && isApproximatelyEqual(o.numericValue, expected))
    .map((o) => o.id);

  if (computedCorrectIds.length === 0) {
    issues.push(
      makeIssue(
        IssueType.NO_VALID_OPTION,
        IssueSeverity.CRITICAL,
        `Independent calculation gives ${expected}, but no option's numeric value matches it.`,
        { expected, options: options.map((o) => ({ id: o.id, numericValue: o.numericValue })) },
      ),
    );
  } else if (computedCorrectIds.length > 1 && !version.multiSelect) {
    issues.push(
      makeIssue(
        IssueType.MULTIPLE_VALID,
        IssueSeverity.CRITICAL,
        `Independent calculation (${expected}) matches more than one option: ${computedCorrectIds.join(', ')}.`,
        { expected, computedCorrectIds },
      ),
    );
  } else if (markedCorrectIds.length > 0) {
    const setsEqual =
      computedCorrectIds.length === markedCorrectIds.length &&
      computedCorrectIds.every((id) => markedCorrectIds.includes(id));
    if (!setsEqual) {
      issues.push(
        makeIssue(
          IssueType.ANSWER_MISMATCH,
          IssueSeverity.CRITICAL,
          `Stored answer key (${markedCorrectIds.join(', ')}) does not match the independently computed ` +
            `answer (${expected}, matching option ${computedCorrectIds.join(', ')}).`,
          { expected, markedCorrectIds, computedCorrectIds },
        ),
      );
    }
  }

  return { issues };
}
