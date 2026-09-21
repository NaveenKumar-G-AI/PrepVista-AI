import type { AIProvider, TestIdeaProposal } from "../types";

/**
 * A deterministic stand-in for a real LLM provider. This is what
 * tests/scripts in this repo actually exercise, since no live
 * GROQ_API_KEY/GEMINI_API_KEY is available in this environment (see
 * .env.example). It implements the exact same interface as the real
 * providers, so swapping it for GroqProvider/GeminiProvider once keys
 * are configured requires no changes to the validation pipeline or
 * callers — see docs/ARCHITECTURE.md#ai-integration for what is and
 * isn't live-verified.
 *
 * Deliberately proposes a MIX of good and bad ideas (out-of-range
 * values, malformed input, a duplicate of a known case) so the
 * validation pipeline has something real to reject — an AI provider
 * that only ever proposed perfect input would not exercise the
 * "AI must not be trusted as the final judge" pipeline at all.
 */
export class MockAIProvider implements AIProvider {
  id = "mock";

  async proposeTestIdeas(args: {
    problemSpec: string;
    constraints: Record<string, unknown>;
    existingCategories: string[];
    count: number;
  }): Promise<TestIdeaProposal[]> {
    const proposals: TestIdeaProposal[] = [
      {
        rationale: "Large array of a single repeated value near the target boundary.",
        suggestedCategory: "adversarial",
        inputData: "6 4\n2 2 2 2 2 2\n",
      },
      {
        rationale: "Constraint violation on purpose: n does not match the array length.",
        suggestedCategory: "edge",
        inputData: "3 5\n1 2\n", // malformed: declares n=3 but only 2 values follow
      },
      {
        rationale: "Value far outside the declared bound, to test constraint enforcement.",
        suggestedCategory: "edge",
        inputData: "2 5\n9999999999999 1\n", // exceeds the 1e9 bound
      },
      {
        rationale: "Duplicate of an already-seeded case (self-pair, target=8).",
        suggestedCategory: "edge",
        inputData: "3 8\n4 4 4\n",
      },
      {
        rationale: "A fresh, valid boundary case: two elements, values at the extreme negative bound.",
        suggestedCategory: "boundary",
        inputData: "2 -2000000000\n-1000000000 -1000000000\n",
      },
    ];
    return proposals.slice(0, args.count);
  }

  async explainResult(args: {
    overallVerdict: string;
    categoryResults: Record<string, { passed: number; total: number }>;
  }): Promise<string> {
    if (args.overallVerdict === "ACCEPTED") {
      return "All visible and hidden checks passed, including boundary and adversarial cases.";
    }
    const failing = Object.entries(args.categoryResults)
      .filter(([, v]) => v.passed < v.total)
      .map(([k]) => k);
    if (failing.includes("performance") || failing.includes("large_input")) {
      return "The visible examples pass, but the solution exceeds the expected complexity for large inputs.";
    }
    if (failing.length > 0) {
      return `The solution handles the visible examples but not every unseen case in: ${failing.join(", ")}.`;
    }
    return "The submission did not pass evaluation.";
  }
}
