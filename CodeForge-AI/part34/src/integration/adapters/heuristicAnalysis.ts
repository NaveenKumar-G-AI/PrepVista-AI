// ============================================================================
// Adapters for the analytical ports Feature 34 must reuse rather than
// reimplement (Phase 18, 28, 29). Real adapters call the existing Reasoning
// Verification / Understanding Check / Debugging Coach services; these
// example versions apply simple, transparent heuristics so the reference
// implementation runs standalone and its behavior is easy to reason about in
// tests.
// ============================================================================

import type { ComplexityAnalysisSummary } from "../ports.js";
import type {
  CodeAnalysisPort,
  DebuggingCoachPort,
  DebuggingContext,
  DebuggingReasoningResult,
  ReasoningVerificationInput,
  ReasoningVerificationPort,
  ReasoningVerificationResult,
  UnderstandingCheckInput,
  UnderstandingCheckPort,
  UnderstandingCheckResult,
} from "../ports.js";
import { EXAMPLE_COMPLEXITY } from "./fixtures.js";

const TRADEOFF_MARKERS = ["trade-off", "tradeoff", "however", "downside", "cost of", "at the expense of"];
const ALTERNATIVE_MARKERS = ["instead of", "alternative", "could also", "another approach", "vs", "versus"];
const ASSUMPTION_MARKERS = ["assum", "given that", "if the", "as long as"];

export class HeuristicReasoningVerificationAdapter implements ReasoningVerificationPort {
  async verifyReasoning(input: ReasoningVerificationInput): Promise<ReasoningVerificationResult> {
    const text = input.studentResponse.toLowerCase();
    const assumptionsIdentified = ASSUMPTION_MARKERS.filter((marker) => text.includes(marker));
    const tradeoffsAddressed = TRADEOFF_MARKERS.some((marker) => text.includes(marker));
    const alternativesConsidered = ALTERNATIVE_MARKERS.some((marker) => text.includes(marker));
    // A conservative, explainable proxy for "does this response actually
    // develop an argument" rather than assert one. Real adapter: delegate to
    // the existing Reasoning Verification system's own scoring.
    const logicalProgressionSound = input.studentResponse.trim().split(/[.!?]+/).filter((s) => s.trim().length > 0).length >= 2;

    return {
      assumptionsIdentified,
      logicalProgressionSound,
      alternativesConsidered,
      tradeoffsAddressed,
      notes: "Heuristic example adapter — wire to the real Reasoning Verification service before production use.",
    };
  }
}

export class HeuristicUnderstandingCheckAdapter implements UnderstandingCheckPort {
  async checkUnderstanding(input: UnderstandingCheckInput): Promise<UnderstandingCheckResult> {
    const hasImplementationEvidence = input.implementationEvidence.length > 0;
    const explanationLength = input.studentExplanation.trim().length;
    const explainsWhy = /because|so that|in order to|reason/i.test(input.studentExplanation);

    let understandingDemonstrated: UnderstandingCheckResult["understandingDemonstrated"] = "NOT_DEMONSTRATED";
    if (explanationLength > 40 && explainsWhy) understandingDemonstrated = "DEMONSTRATED";
    else if (explanationLength > 15) understandingDemonstrated = "PARTIAL";

    return {
      understandingDemonstrated,
      distinguishesImplementationFromUnderstanding: hasImplementationEvidence,
      notes: hasImplementationEvidence
        ? "Implementation evidence exists independently of this explanation; understanding is assessed on the explanation alone (Phase 29)."
        : "No prior implementation evidence supplied for this skill.",
    };
  }
}

export class FixtureDebuggingCoachAdapter implements DebuggingCoachPort {
  async getDebuggingScenario(_skillId: string, _difficulty: number): Promise<DebuggingContext | null> {
    return {
      scenarioId: "scenario_n_plus_1",
      symptom: "The /tasks endpoint gets slower as users add more tasks, and database CPU spikes under load.",
      relevantCode:
        "router.get('/tasks', requireAuth, async (req, res) => {\n  const tasks = await Task.findAll({ where: { userId: req.user.id } });\n  for (const task of tasks) {\n    task.tags = await Tag.findAll({ where: { taskId: task.id } });\n  }\n  res.json(tasks);\n});",
    };
  }

  async evaluateDebuggingReasoning(_context: DebuggingContext, studentResponse: string): Promise<DebuggingReasoningResult> {
    const text = studentResponse.toLowerCase();
    const symptomIdentified = /slow|latency|cpu|n\+1|per.request|query count/.test(text);
    const mentionsJoin = /join|eager load|include|preload|batch/.test(text);
    const mentionsRootCause = /loop|for each|per task|n\+1|repeated quer/.test(text);
    const mentionsFix = /join|include|preload|dataloader|batch|single query/.test(text);

    return {
      symptomIdentified,
      hypothesisQuality: mentionsRootCause ? "STRONG" : symptomIdentified ? "ADEQUATE" : "WEAK",
      investigationStrategySound: /log|profil|explain|query plan|measure/.test(text) || mentionsRootCause,
      rootCauseReasoningSound: mentionsRootCause,
      fixValid: studentResponse.trim().length === 0 ? "NOT_ANSWERED" : mentionsFix || mentionsJoin,
    };
  }
}

export class FixtureCodeAnalysisAdapter implements CodeAnalysisPort {
  async getComplexityAnalysis(submissionId: string): Promise<ComplexityAnalysisSummary | null> {
    return EXAMPLE_COMPLEXITY[submissionId] ?? null;
  }
}
