import type { AIProvider, TestIdeaProposal } from "../types";
import { ProviderUnavailableError, ProviderTimeoutError } from "../types";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

/**
 * Real client — NOT exercised live in this session, because
 * GROQ_API_KEY is intentionally left empty (see .env.example). Once
 * a key is configured this needs no other code changes: it satisfies
 * the same AIProvider interface as MockAIProvider, so
 * lib/ai/provider-selector.ts can use it as-is.
 */
export class GroqProvider implements AIProvider {
  id = "groq";
  constructor(
    private apiKey: string,
    private model: string = "llama-3.3-70b-versatile",
    private timeoutMs = 15_000
  ) {}

  private async chat(systemPrompt: string, userPrompt: string): Promise<string> {
    if (!this.apiKey) throw new ProviderUnavailableError("GROQ_API_KEY is not configured");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.7,
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new ProviderUnavailableError(`Groq HTTP ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return data.choices?.[0]?.message?.content ?? "";
    } catch (err) {
      if ((err as Error).name === "AbortError") throw new ProviderTimeoutError("Groq request timed out");
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async proposeTestIdeas(args: {
    problemSpec: string;
    constraints: Record<string, unknown>;
    existingCategories: string[];
    count: number;
  }): Promise<TestIdeaProposal[]> {
    const content = await this.chat(
      "You propose candidate hidden test INPUTS for a coding-assessment platform. " +
        "You never compute or claim an expected output — a trusted reference solution does that. " +
        'Reply with strict JSON: {"proposals": [{"rationale": string, "suggestedCategory": string, "inputData": string}]}',
      `Problem spec: ${args.problemSpec}\nConstraints: ${JSON.stringify(args.constraints)}\n` +
        `Propose ${args.count} candidate test inputs covering categories not yet well covered ` +
        `(existing: ${args.existingCategories.join(", ") || "none"}).`
    );
    const parsed = JSON.parse(content);
    return parsed.proposals ?? [];
  }

  async explainResult(args: {
    overallVerdict: string;
    categoryResults: Record<string, { passed: number; total: number }>;
  }): Promise<string> {
    return this.chat(
      "You explain a deterministic grading result in one or two plain sentences, grounded ONLY " +
        "in the verdict and category pass/fail counts given to you. Never invent failing cases " +
        "that are not in the data.",
      JSON.stringify(args)
    );
  }
}
