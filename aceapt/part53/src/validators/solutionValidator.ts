import { computeExpectedValue } from '../domain/computation.js';
import { isApproximatelyEqual } from '../utils/misc.js';
import { Issue, QuestionVersion } from '../types/domain.js';
import { IssueSeverity, IssueType } from '../types/enums.js';
import { makeIssue, ValidatorOutcome } from './types.js';

/**
 * Section 64: "If canonical solution is wrong: Socratic tutoring can teach the wrong concept.
 * Therefore: SOLUTION VALIDITY IS CRITICAL." This validator never trusts free-text solution prose
 * as ground truth (section 16 — AI/heuristic output is a signal, not unquestioned truth): a
 * structured `derivedValue` is treated as CRITICAL evidence, but a value pattern-matched out of
 * free text is only ever treated as MEDIUM-confidence and clearly labeled as such.
 */
export function validateSolution(version: QuestionVersion): ValidatorOutcome {
  const issues: Issue[] = [];
  if (!version.solution) return { issues };

  const { solution } = version;
  let solutionValue: number | undefined;
  let confidence: 'STRUCTURED' | 'HEURISTIC' = 'STRUCTURED';

  if (typeof solution.derivedValue === 'number') {
    solutionValue = solution.derivedValue;
  } else if (solution.text) {
    const match = solution.text.match(/=\s*(-?[\d.]+)\s*%?\s*\.?\s*$/);
    if (match) {
      solutionValue = parseFloat(match[1]);
      confidence = 'HEURISTIC';
    }
  }

  if (solutionValue === undefined) return { issues }; // nothing we can automatically check

  let expected: number | undefined;
  if (version.computation) {
    try {
      expected = computeExpectedValue(version.computation);
    } catch {
      // Already reported by AnswerValidator; don't double-report the same root cause here.
    }
  }
  if (expected === undefined) {
    const correctOption = version.options?.find((o) => version.answerKey?.includes(o.id));
    expected = correctOption?.numericValue;
  }
  if (expected === undefined) return { issues };

  if (!isApproximatelyEqual(solutionValue, expected)) {
    issues.push(
      makeIssue(
        IssueType.SOLUTION_MISMATCH,
        confidence === 'STRUCTURED' ? IssueSeverity.CRITICAL : IssueSeverity.MEDIUM,
        `Solution appears to derive ${solutionValue}, which does not match the expected answer ${expected}.` +
          (confidence === 'HEURISTIC'
            ? ' (Value extracted heuristically from free-text solution — verify manually before treating as certain.)'
            : ''),
        { solutionValue, expected, confidence },
      ),
    );
  }

  return { issues };
}
