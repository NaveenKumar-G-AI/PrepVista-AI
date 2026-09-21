import type { AIProvider, TestIdeaProposal } from "../types";
import { ProviderUnavailableError, ProviderTimeoutError } from "../types";

/**
 * Real client — NOT exercised live in this session (GEMINI_API_KEY is
 * intentionally empty, see .env.example). Same AIProvider interface as
 * MockAIProvider and GroqProvider, so it's a drop-in fallback — see
 * lib/ai/provider-selector.ts.
 */
export class GeminiProvider implements AIProvider {
  id = "gemini";
  constructor(
    private apiKey: string,
    private model: string = "gemini-1.5-flash",
    private timeoutMs = 15_000
  ) {}

  private url(): string {
    return `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
  }

  private async generate(systemPrompt: string, userPrompt: string): Promise<string> {
    if (!this.apiKey) throw new ProviderUnavailableError("GEMINI_API_KEY is not configured");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(this.url(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ parts: [{ text: userPrompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new ProviderUnavailableError(`Gemini HTTP ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    } catch (err) {
      if ((err as Error).name === "AbortError") throw new ProviderTimeoutError("Gemini request timed out");
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
    const content = await this.generate(
      "You propose candidate hidden test INPUTS only, never expected outputs. " +
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
    return this.generate(
      "Explain this deterministic grading result in one or two plain sentences, grounded only in the given data.",
      JSON.stringify(args)
    );
  }
}
