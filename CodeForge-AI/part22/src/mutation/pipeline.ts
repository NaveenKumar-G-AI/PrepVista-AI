import type { Executor } from "../sandbox/executor.js";
import { classifyFailure, type ClassificationContext } from "../debugging/fingerprint.js";
import type { FailureClass, SupportedLanguage } from "../types.js";

/**
 * Textual, pattern-based mutation operators - deliberately conservative
 * (each targets one unambiguous syntactic pattern) rather than a full AST
 * mutator, so every mutation this module proposes is at least syntactically
 * sane. What makes a mutation *usable* is not this list, though - it's
 * `validateMutation` actually running both versions of the code and proving
 * the failure. An operator firing is a proposal, never a publication.
 */
export interface MutationOperator {
  id: string;
  description: string;
  languages: SupportedLanguage[];
  failureClassHint: FailureClass;
  apply: (code: string, language: SupportedLanguage) => string | null;
}

export const MUTATION_OPERATORS: MutationOperator[] = [
  {
    id: "wrong_comparison_lt_lte",
    description: "wrong comparison: `<` became `<=`",
    languages: ["python", "javascript"],
    failureClassHint: "EDGE_CASE_FAILURE",
    apply: (code) => replaceFirst(code, /(?<![<>=!])<(?![=<])/, "<=")
  },
  {
    id: "wrong_comparison_gt_gte",
    description: "wrong comparison: `>` became `>=`",
    languages: ["python", "javascript"],
    failureClassHint: "EDGE_CASE_FAILURE",
    apply: (code) => replaceFirst(code, /(?<![<>=!])>(?![=>])/, ">=")
  },
  {
    id: "wrong_loop_boundary_range_shrink",
    description: "wrong loop boundary: `range(n)` became `range(n - 1)`",
    languages: ["python"],
    failureClassHint: "EDGE_CASE_FAILURE",
    apply: (code) => replaceFirstCapture(code, /range\(([a-zA-Z_][a-zA-Z0-9_]*)\)/, (m) => `range(${m[1]} - 1)`)
  },
  {
    id: "incorrect_initialization_zero_to_one",
    description: "incorrect initialization: `= 0` became `= 1`",
    languages: ["python", "javascript"],
    failureClassHint: "WRONG_ANSWER",
    apply: (code) => replaceFirst(code, /=\s*0(?!\d)/, "= 1")
  },
  {
    id: "wrong_boolean_return",
    description: "incorrect return: a boolean return value was flipped",
    languages: ["python", "javascript"],
    failureClassHint: "WRONG_ANSWER",
    apply: (code, language) => {
      const [truthy, falsy] = language === "python" ? ["True", "False"] : ["true", "false"];
      return replaceFirst(code, new RegExp(`return ${truthy}\\b`), `return ${falsy}`);
    }
  },
  {
    id: "missing_state_update",
    description: "missing state update: `+=` became `=`",
    languages: ["python", "javascript"],
    failureClassHint: "LOGIC_ERROR",
    apply: (code) => replaceFirst(code, /(\w+)\s\+=\s/, "$1 = ")
  }
];

function replaceFirst(code: string, pattern: RegExp, replacement: string): string | null {
  if (!pattern.test(code)) return null;
  return code.replace(pattern, replacement);
}

function replaceFirstCapture(code: string, pattern: RegExp, replacer: (match: RegExpMatchArray) => string): string | null {
  const match = code.match(pattern);
  if (!match || match.index === undefined) return null;
  return code.slice(0, match.index) + replacer(match) + code.slice(match.index + match[0].length);
}

export interface MutationCandidate {
  operatorId: string;
  description: string;
  originalCode: string;
  mutatedCode: string;
  failureClassHint: FailureClass;
}

export function proposeMutations(originalCode: string, language: SupportedLanguage): MutationCandidate[] {
  const candidates: MutationCandidate[] = [];
  for (const op of MUTATION_OPERATORS) {
    if (!op.languages.includes(language)) continue;
    const mutated = op.apply(originalCode, language);
    if (mutated !== null && mutated !== originalCode) {
      candidates.push({
        operatorId: op.id,
        description: op.description,
        originalCode,
        mutatedCode: mutated,
        failureClassHint: op.failureClassHint
      });
    }
  }
  return candidates;
}

// ---------------------------------------------------------------------------
// Validation pipeline: Original -> Mutation -> Automatic Validation ->
// Expected Failure Confirmed -> (only then) Challenge Published
// ---------------------------------------------------------------------------

export interface MutationTestCase {
  id: string;
  input: string;
  expectedOutput: string;
  isEdgeCase?: boolean;
}

export interface MutationValidationResult {
  candidate: MutationCandidate;
  valid: boolean;
  reasons: string[];
  originalPassedAllTests: boolean;
  mutantFailedIntendedTest: boolean;
  mutantFailureClass: FailureClass | null;
  reproducible: boolean;
}

export async function validateMutation(
  executor: Executor,
  language: SupportedLanguage,
  candidate: MutationCandidate,
  tests: MutationTestCase[]
): Promise<MutationValidationResult> {
  const reasons: string[] = [];

  // 1. The "reference" implementation must actually be reference-quality:
  //    if it doesn't pass every provided test pre-mutation, we can't trust
  //    that a post-mutation failure came from the mutation at all.
  const originalRuns = await Promise.all(tests.map((t) => executor.run({ language, code: candidate.originalCode, stdin: t.input }).then((r) => ({ t, r }))));
  const originalPassedAllTests = originalRuns.every(({ t, r }) => classify(r, t) === null);
  if (!originalPassedAllTests) reasons.push("Original (pre-mutation) code did not pass all provided tests.");

  // 2. The mutant must actually fail something.
  const mutantRuns = await Promise.all(tests.map((t) => executor.run({ language, code: candidate.mutatedCode, stdin: t.input }).then((r) => ({ t, r }))));
  const mutantOutcomes = mutantRuns.map(({ t, r }) => ({ test: t, result: r, failureClass: classify(r, t) }));
  const mutantFailures = mutantOutcomes.filter((o) => o.failureClass !== null);
  const mutantFailedIntendedTest = mutantFailures.length > 0;
  if (!mutantFailedIntendedTest) reasons.push("Mutation did not cause any provided test to fail - rejected as a no-op mutant.");

  const firstFailure = mutantFailures[0] ?? null;
  const mutantFailureClass = firstFailure?.failureClass ?? null;

  // 3. Reproducibility: re-run the first failing case; a bug that can't
  //    reproduce itself twice never gets published.
  let reproducible = false;
  if (firstFailure) {
    const repeat = await executor.run({ language, code: candidate.mutatedCode, stdin: firstFailure.test.input });
    const repeatClass = classify(repeat, firstFailure.test);
    reproducible = repeatClass === mutantFailureClass;
    if (!reproducible) reasons.push("Mutation's failure did not reproduce on a second run - rejected as flaky.");
  }

  // 4. Advisory (non-blocking) signal: a single well-scoped bug usually
  //    doesn't fail the majority of unrelated tests. This does not reject
  //    the mutation on its own in this iteration - see README limitations -
  //    but is surfaced so a human/AI reviewer can weigh it.
  if (mutantFailedIntendedTest && tests.length > 1) {
    const unrelatedFailures = mutantFailures.length - 1;
    if (unrelatedFailures / tests.length > 0.5) {
      reasons.push(`Mutation broke ${unrelatedFailures} additional test(s) beyond the first failure - unusually broad for a single bug.`);
    }
  }

  return {
    candidate,
    valid: originalPassedAllTests && mutantFailedIntendedTest && reproducible,
    reasons,
    originalPassedAllTests,
    mutantFailedIntendedTest,
    mutantFailureClass,
    reproducible
  };
}

function classify(result: Parameters<typeof classifyFailure>[0], test: MutationTestCase): FailureClass | null {
  const ctx: ClassificationContext = { isEdgeCaseInput: test.isEdgeCase };
  return classifyFailure(result, test.expectedOutput, ctx);
}

/**
 * Tries each proposed mutation in turn and returns the first one that
 * clears validation. Returns null - never a fabricated/unverified mutation
 * - if nothing validates.
 */
export async function generateVerifiedMutation(
  executor: Executor,
  language: SupportedLanguage,
  originalCode: string,
  tests: MutationTestCase[]
): Promise<MutationValidationResult | null> {
  const candidates = proposeMutations(originalCode, language);
  for (const candidate of candidates) {
    const result = await validateMutation(executor, language, candidate, tests);
    if (result.valid) return result;
  }
  return null;
}
