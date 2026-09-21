import type { AIExplanationContext, AIExplanationPort } from "../ports/index.js";

/**
 * Real adapter for CodeForge's existing AI Gateway (Phase 33). This layer
 * ONLY turns already-computed, already-authoritative structured data into
 * a nicer sentence - it never receives raw scores or role requirements to
 * reason about on its own, and its output is never persisted as anything
 * other than an optional display string alongside the deterministic
 * explanation (see application/gapAnalysisService.ts).
 *
 * Point AI_GATEWAY_BASE_URL / AI_GATEWAY_API_KEY at your real gateway.
 * Left unset, GapAnalysisService simply skips this adapter and uses the
 * deterministic explanation only (Phase 34, 75) - callers should treat any
 * failure/timeout here as non-fatal.
 */
export class AIGatewayExplanationAdapter implements AIExplanationPort {
  constructor(
    private config: { baseUrl: string; apiKey: string; timeoutMs?: number } = {
      baseUrl: process.env.AI_GATEWAY_BASE_URL ?? "",
      apiKey: process.env.AI_GATEWAY_API_KEY ?? "",
      timeoutMs: 8000,
    },
  ) {}

  async explain(context: AIExplanationContext): Promise<string> {
    if (!this.config.baseUrl || !this.config.apiKey) {
      throw new Error("AI Gateway is not configured - falling back to deterministic explanation.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 8000);

    try {
      const response = await fetch(this.config.baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        // The gateway receives ONLY the already-computed structured
        // explanation context - it is asked to phrase it, not to
        // determine severity, priority, or gap status (Phase 33).
        body: JSON.stringify({
          instructions:
            "Rewrite the following structured skill-gap result as one short, encouraging paragraph for a student. " +
            "Do not introduce any fact not present in the input.",
          context,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`AI Gateway responded with status ${response.status}`);
      }

      const data = (await response.json()) as { text?: string };
      if (!data.text) throw new Error("AI Gateway returned no text");
      return data.text;
    } finally {
      clearTimeout(timeout);
    }
  }
}

/** Always-fails stand-in, useful in tests that want to assert the
 *  deterministic-explanation fallback path (Phase 34/75) actually works. */
export class FailingAIExplanationAdapter implements AIExplanationPort {
  async explain(): Promise<string> {
    throw new Error("Simulated AI Gateway failure");
  }
}
