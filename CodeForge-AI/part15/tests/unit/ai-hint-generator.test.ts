import { describe, expect, it } from "vitest";
import { generateHint } from "@/lib/hint-ladder/ai-hint-generator";
import { PolicyDecision } from "@/lib/hint-ladder/policy-engine";
import { PromptContext } from "@/lib/hint-ladder/prompt-builder";
import { FakeProvider, fixedJsonResponder } from "@/lib/hint-ladder/providers/fake-provider";
import { ProviderRouter } from "@/lib/hint-ladder/providers/router";
import { ProblemContext, RootIssueHypothesis } from "@/lib/hint-ladder/types";

const problem: ProblemContext = {
  problemId: "p1",
  title: "Sum Array",
  statement: "Return the sum of all elements.",
  constraints: ["1 <= nums.length <= 1000"],
  examples: [{ input: "[1,2,3]", output: "6" }],
  entryPointHints: ["solve"],
  language: "python",
};

const rootIssue: RootIssueHypothesis = {
  observedFailure: "6/10 tests passed; the rest produced incorrect output.",
  concept: "BOUNDARY_CONDITION",
  conceptDetail: "Understand how the valid index/size range relates to the loop.",
  relevantArea: { file: null, functionName: "solve", startLine: 2, endLine: 4, snippet: "for i in range(len(nums)):", sourceOfTruth: "STATIC_HEURISTIC" },
  teachingObjective: "Understand how the valid index/size range relates to the loop.",
  confidence: "MEDIUM",
};

const decision: PolicyDecision = {
  kind: "DELIVER_FIRST_HINT",
  targetLevel: "DIRECTION",
  targetHintType: "DIRECTION",
  freshRootIssue: true,
  reason: "no_prior_hint",
  offerSolutionOption: false,
};

const promptContext: PromptContext = {
  problem,
  code: "def solve(nums):\n    total = 0\n    for i in range(len(nums)):\n        total += nums[i]\n    return total",
  language: "python",
  rootIssue,
  decision,
  studentFreeText: null,
  studentResponseSignal: null,
  priorHintTexts: [],
  progressNote: null,
};

const validModelJson = {
  assistance_level: "DIRECTION",
  hint_type: "DIRECTION",
  concept: "BOUNDARY_CONDITION",
  observation: "6/10 tests passed.",
  hint: "Look closely at how your loop handles the final valid element.",
  target_area: "solve() loop",
  confidence: "MEDIUM",
  teaching_objective: "Understand the valid index range.",
  next_action: "await_student_response",
  solution_revealed: false,
};

describe("generateHint", () => {
  it("returns AI_GENERATED payload on a clean first-try success", async () => {
    const provider = new FakeProvider(fixedJsonResponder(validModelJson));
    const router = new ProviderRouter({ groq: provider }, { primary: "groq", timeoutMs: 5000 });
    const result = await generateHint({ router, decision, promptContext });
    expect(result.source).toBe("AI_GENERATED");
    expect(result.attempts).toBe(1);
    expect(result.payload.hint).toContain("final valid element");
  });

  it("retries once with a correction prompt when the first response fails schema validation, then succeeds", async () => {
    let callCount = 0;
    const provider = new FakeProvider((_params) => {
      callCount++;
      if (callCount === 1) return JSON.stringify({ hint: "malformed, missing required fields" });
      return JSON.stringify(validModelJson);
    });
    const router = new ProviderRouter({ groq: provider }, { primary: "groq", timeoutMs: 5000 });
    const result = await generateHint({ router, decision, promptContext });
    expect(result.source).toBe("AI_GENERATED");
    expect(result.attempts).toBe(2);
    expect(provider.calls[1]?.userPrompt).toContain("correction_required");
  });

  it("falls back to a deterministic, evidence-grounded hint when every provider is unavailable", async () => {
    const router = new ProviderRouter({}, { primary: "groq", timeoutMs: 5000 }); // nothing configured
    const result = await generateHint({ router, decision, promptContext });
    expect(result.source).toBe("DETERMINISTIC_FALLBACK");
    expect(result.payload.observation).toBe(rootIssue.observedFailure); // grounded in real data, not invented
    expect(result.payload.solutionRevealed).toBe(false);
  });

  it("falls back to deterministic content when the model returns unparseable output twice in a row", async () => {
    const provider = new FakeProvider(() => "not json at all");
    const router = new ProviderRouter({ groq: provider }, { primary: "groq", timeoutMs: 5000 });
    const result = await generateHint({ router, decision, promptContext });
    expect(result.source).toBe("DETERMINISTIC_FALLBACK");
    expect(provider.calls.length).toBe(2); // one original attempt + one retry, then gave up honestly
  });

  it("never lets the fallback path claim solution_revealed even at high assistance levels", async () => {
    const router = new ProviderRouter({}, { primary: "groq", timeoutMs: 5000 });
    const solutionDecision: PolicyDecision = {
      kind: "DELIVER_SOLUTION",
      targetLevel: "SOLUTION_ASSISTANCE",
      targetHintType: "SOLUTION_ASSISTANCE",
      freshRootIssue: false,
      reason: "solution_request_authorized",
      offerSolutionOption: false,
    };
    const result = await generateHint({ router, decision: solutionDecision, promptContext: { ...promptContext, decision: solutionDecision } });
    expect(result.source).toBe("DETERMINISTIC_FALLBACK");
    expect(result.payload.solutionRevealed).toBe(false); // fallback never fabricates a solution, even if authorized
  });
});
