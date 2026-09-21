import { countNumericParams } from '../domain/computation.js';
import { escapeRegExp, isApproximatelyEqual } from '../utils/misc.js';
import { QuestionVersion } from '../types/domain.js';
import { IssueSeverity, IssueType } from '../types/enums.js';
import { makeIssue, ValidatorOutcome } from './types.js';

// Deliberately tiny and conservative — a real deployment should let AIValidator's clarity
// signal (which has actual language understanding) carry more of this weight. This heuristic
// exists so clarity checking still works with zero external dependencies.
const VAGUE_PHRASES = ['as soon as possible', 'some amount', 'a few', 'roughly around', 'etc.'];

/**
 * Section 34 (under-specified) and section 35 (contradictory information) example cases are
 * implemented literally here; general ambiguity detection (section 33) is a light heuristic by
 * design — see AIValidator for the deeper natural-language pass.
 */
export function validateClarity(version: QuestionVersion): ValidatorOutcome {
  const issues = [];
  const stem = version.content ?? '';

  // Section 34: "A car travels at a constant speed. How long does it take?" — not enough given
  // to solve. Heuristic: the computation needs N numeric inputs; the stem should mention at
  // least that many numbers, or a human reading only the stem can't actually solve it.
  if (version.computation) {
    const needed = countNumericParams(version.computation);
    const mentioned = (stem.match(/\d+(\.\d+)?/g) ?? []).length;
    if (mentioned < needed) {
      issues.push(
        makeIssue(
          IssueType.UNDER_SPECIFIED,
          IssueSeverity.HIGH,
          `This question's computation needs at least ${needed} numeric value(s) to solve, but the stem only ` +
            `mentions ${mentioned}. A student reading only the stem may not have enough information (section 34).`,
        ),
      );
    }
  }

  // Section 35: stem says "5 red balls", structured context says redBalls: 6 -> contradiction.
  if (version.context?.facts) {
    for (const [label, value] of Object.entries(version.context.facts)) {
      const pattern = new RegExp(`(\\d+(?:\\.\\d+)?)\\s+${escapeRegExp(label)}`, 'i');
      const match = stem.match(pattern);
      if (match) {
        const stemValue = parseFloat(match[1]);
        if (!isApproximatelyEqual(stemValue, value, 0, 1e-9)) {
          issues.push(
            makeIssue(
              IssueType.INTERNAL_CONTRADICTION,
              IssueSeverity.CRITICAL,
              `Stem says "${stemValue} ${label}" but the structured question data says ${label} = ${value}.`,
              { label, stemValue, structuredValue: value },
            ),
          );
        }
      }
    }
  }

  const questionMarks = (stem.match(/\?/g) ?? []).length;
  if (questionMarks > 1) {
    issues.push(
      makeIssue(
        IssueType.AMBIGUOUS,
        IssueSeverity.LOW,
        `Stem contains ${questionMarks} question marks — consider whether it is really asking one thing.`,
      ),
    );
  }

  const lowerStem = stem.toLowerCase();
  const foundVague = VAGUE_PHRASES.find((p) => lowerStem.includes(p));
  if (foundVague) {
    issues.push(
      makeIssue(
        IssueType.AMBIGUOUS,
        IssueSeverity.LOW,
        `Stem contains a vague phrase ("${foundVague}") that may be worth tightening for a formal item.`,
      ),
    );
  }

  return { issues };
}
