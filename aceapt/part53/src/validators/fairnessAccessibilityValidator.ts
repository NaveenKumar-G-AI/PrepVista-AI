import { average } from '../utils/misc.js';
import { QuestionVersion } from '../types/domain.js';
import { IssueSeverity, IssueType } from '../types/enums.js';
import { makeIssue, ValidatorOutcome } from './types.js';

const MAX_STEM_LENGTH = 800;
const ABSOLUTE_TERMS = /\b(always|never)\b/i;

/**
 * This validator sticks to well-established, objectively checkable item-writing flaws rather than
 * attempting a general-purpose bias/fairness classifier (which would need far more context than a
 * question object gives you, and would risk asserting authority it doesn't have). Specifically:
 *
 *  - Option-length bias: if the correct option is conspicuously longer/shorter than the
 *    distractors, test-savvy students can often guess it without knowing the content — a known,
 *    documented item-writing flaw (section 30's "trivially eliminated options" spirit).
 *  - Absolute-term bias: "always"/"never" showing up only in distractors is a well-known
 *    test-taking-strategy exploit.
 *  - Diagram alt text / stem length: accessibility basics (section 14/21/89).
 */
export function validateFairnessAndAccessibility(version: QuestionVersion): ValidatorOutcome {
  const issues = [];
  const options = version.options ?? [];
  const correctIds = new Set(version.answerKey ?? []);

  const correctLens = options.filter((o) => correctIds.has(o.id)).map((o) => (o.text ?? '').length);
  const distractorLens = options.filter((o) => !correctIds.has(o.id)).map((o) => (o.text ?? '').length);

  if (correctLens.length > 0 && distractorLens.length > 0) {
    const avgCorrect = average(correctLens);
    const avgDistractor = average(distractorLens);
    if (avgDistractor > 0 && (avgCorrect > avgDistractor * 1.6 || avgCorrect < avgDistractor * 0.6)) {
      issues.push(
        makeIssue(
          IssueType.FAIRNESS_CONCERN,
          IssueSeverity.LOW,
          `Correct option length (avg ${avgCorrect.toFixed(0)} chars) differs sharply from the distractor ` +
            `average (${avgDistractor.toFixed(0)} chars) — a known giveaway for test-savvy students.`,
        ),
      );
    }
  }

  const distractorAbsolutes = options.filter((o) => !correctIds.has(o.id) && ABSOLUTE_TERMS.test(o.text ?? '')).length;
  const correctAbsolutes = options.filter((o) => correctIds.has(o.id) && ABSOLUTE_TERMS.test(o.text ?? '')).length;
  if (distractorAbsolutes > 0 && correctAbsolutes === 0 && distractorLens.length > 0) {
    issues.push(
      makeIssue(
        IssueType.FAIRNESS_CONCERN,
        IssueSeverity.LOW,
        'Absolute terms ("always"/"never") appear only in distractors — a known test-taking-strategy giveaway.',
      ),
    );
  }

  if (version.diagram && !version.diagram.altText) {
    issues.push(
      makeIssue(
        IssueType.ACCESSIBILITY_CONCERN,
        IssueSeverity.MEDIUM,
        'Question includes a diagram with no altText; screen-reader users cannot access this content.',
      ),
    );
  }

  if ((version.content ?? '').length > MAX_STEM_LENGTH) {
    issues.push(
      makeIssue(
        IssueType.ACCESSIBILITY_CONCERN,
        IssueSeverity.LOW,
        `Stem is ${version.content!.length} characters (over ${MAX_STEM_LENGTH}) — consider simplifying for ` +
          'readability and cognitive accessibility.',
      ),
    );
  }

  return { issues };
}
