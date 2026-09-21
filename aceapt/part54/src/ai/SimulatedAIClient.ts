import type { AIValidatorClient, AISemanticInput, AISemanticOutput } from "./AIValidatorClient.js";
import { AIUnavailableError } from "./AIValidatorClient.js";

/** Always throws — used as the default client when no real key/adapter is
 *  wired in, so "AI assistance is off" behaves identically to "AI is down"
 *  from the validator's point of view (spec §170: both paths must fall back
 *  to a deterministic, honest REVIEW_REQUIRED-flavored result, never a false PASS). */
export class DeterministicFallbackAIClient implements AIValidatorClient {
  async assess(): Promise<AISemanticOutput> {
    throw new AIUnavailableError("no AI adapter configured");
  }
}

/**
 * Contract-faithful fake for tests: returns exactly the shape a real adapter
 * would, driven by simple content-based rules, so test scenarios are legible
 * (a question mentioning "ambiguous" triggers REVIEW, everything else is OK)
 * without needing network access. This is the same pattern used for
 * CodeForge's Feature 35 ("a real-but-unexercised Groq adapter plus a
 * contract-faithful simulated one for tests").
 */
export class SimulatedAIClient implements AIValidatorClient {
  constructor(private readonly behavior: "ALWAYS_OK" | "ALWAYS_REVIEW" | "CONTENT_DRIVEN" | "MALFORMED" | "UNAVAILABLE" = "CONTENT_DRIVEN") {}

  async assess(input: AISemanticInput): Promise<AISemanticOutput> {
    if (this.behavior === "UNAVAILABLE") throw new AIUnavailableError("simulated outage");
    if (this.behavior === "MALFORMED") {
      // Intentionally return something that will fail schema validation upstream,
      // to exercise AI_OUTPUT_INVALID handling.
      return { status: "MAYBE" as never };
    }
    if (this.behavior === "ALWAYS_OK") return { status: "OK" };
    if (this.behavior === "ALWAYS_REVIEW") {
      return { status: "REVIEW", issueType: "CLARITY", severity: "MEDIUM", evidence: "Simulated reviewer flagged this question.", confidence: "moderate" };
    }
    // CONTENT_DRIVEN — legible, deterministic-for-tests behavior.
    const lower = input.questionText.toLowerCase();
    if (lower.includes("ambiguous") || lower.includes("could be interpreted")) {
      return { status: "REVIEW", issueType: "AMBIGUITY", severity: "MEDIUM", evidence: "Question wording admits more than one reasonable reading.", confidence: "moderate" };
    }
    return { status: "OK" };
  }
}
