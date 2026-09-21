export interface TestIdeaProposal {
  rationale: string;
  suggestedCategory:
    | "basic"
    | "boundary"
    | "edge"
    | "adversarial"
    | "large_input"
    | "performance"
    | "regression"
    | "special_condition";
  /** Raw candidate input text, in the problem's own input format. Never an expected output — see validation-pipeline.ts for why. */
  inputData: string;
}

export interface AIProvider {
  id: string;
  proposeTestIdeas(args: {
    problemSpec: string;
    constraints: Record<string, unknown>;
    existingCategories: string[];
    count: number;
  }): Promise<TestIdeaProposal[]>;

  explainResult(args: {
    overallVerdict: string;
    categoryResults: Record<string, { passed: number; total: number }>;
  }): Promise<string>;
}

export class ProviderTimeoutError extends Error {}
export class ProviderUnavailableError extends Error {}
