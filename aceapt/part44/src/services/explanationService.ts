// Turns a deterministic engine's already-correct reason string into
// warmer prose (Section 36, 49). The deterministic string is ALWAYS
// computed first and is what ships if the LLM call fails for any
// reason - AI can only rephrase, never supply the underlying fact
// (Section 50).
import { AnthropicClient } from "../integrations/ai/AnthropicClient.js";

export interface Explanation {
  text: string;
  source: "AI" | "DETERMINISTIC";
}

export class ExplanationService {
  constructor(private readonly anthropic: AnthropicClient = new AnthropicClient()) {}

  async explain(deterministicReason: string): Promise<Explanation> {
    if (!this.anthropic.isConfigured) {
      return { text: deterministicReason, source: "DETERMINISTIC" };
    }
    try {
      const polished = await this.anthropic.polishExplanation(deterministicReason);
      return { text: polished, source: "AI" };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("Anthropic explanation polish failed, using deterministic reason as-is:", (err as Error).message);
      return { text: deterministicReason, source: "DETERMINISTIC" };
    }
  }
}
