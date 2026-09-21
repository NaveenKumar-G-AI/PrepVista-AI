import type { CapabilityGap } from "../types/domain.js";

/**
 * Turns a computed CapabilityGap into a short, honest, human sentence.
 *
 * Two providers implement the same interface:
 *  - TemplateExplanationProvider (default): deterministic, zero
 *    dependencies, always available. This is the right default per
 *    spec section 19 — explaining a number is close enough to a
 *    deterministic transformation that a template is more honest than
 *    dressing it up as a model call.
 *  - LlmExplanationProvider (opt-in): calls the real Anthropic Messages
 *    API for more natural phrasing. Disabled unless USE_LLM_EXPLANATIONS
 *    is enabled *and* an API key is present. If the call fails for any
 *    reason, it falls back to the template provider rather than
 *    breaking the feature (spec section 20: "the entire feature must
 *    not collapse because one model call fails").
 */
export interface ExplanationProvider {
  explain(gap: CapabilityGap): Promise<string>;
}

const TREND_PHRASE: Record<CapabilityGap["trend"], string> = {
  IMPROVING: "Your recent attempts are trending up, so keep going.",
  DECLINING: "Your recent attempts have dipped — worth revisiting the fundamentals here.",
  STABLE: "Your score has been steady, so a different practice approach may help more than repeating the same one.",
  INSUFFICIENT_DATA: "That's based on a single attempt so far, so treat it as an early signal, not a verdict.",
};

export class TemplateExplanationProvider implements ExplanationProvider {
  async explain(gap: CapabilityGap): Promise<string> {
    if (gap.evidenceCount === 0) {
      return `No ${gap.capabilityName} assessment yet. This area carries real weight for your target role, so it's worth establishing a baseline.`;
    }
    if (gap.onTrack) {
      return `Based on ${gap.evidenceCount} recorded attempt${gap.evidenceCount === 1 ? "" : "s"}, your ${gap.capabilityName} score (${gap.currentScore}/100) is already at or above the ${gap.targetBar} benchmark for this role.`;
    }
    const attemptWord = gap.evidenceCount === 1 ? "attempt" : "attempts";
    return `Based on ${gap.evidenceCount} recorded ${attemptWord}, your ${gap.capabilityName} score is ${gap.currentScore}/100 — below the ${gap.targetBar} benchmark for this role. ${TREND_PHRASE[gap.trend]}`;
  }
}

interface LlmExplanationConfig {
  apiKey: string;
  model: string;
}

/**
 * Real integration code, not a mock — but it only runs if explicitly
 * enabled with a real key. See README "AI impact" for how to turn it on.
 */
export class LlmExplanationProvider implements ExplanationProvider {
  constructor(private readonly config: LlmExplanationConfig) {}

  async explain(gap: CapabilityGap): Promise<string> {
    const prompt = [
      `Capability: ${gap.capabilityName}`,
      `Recorded attempts: ${gap.evidenceCount}`,
      `Current score: ${gap.currentScore ?? "none yet"} / target ${gap.targetBar}`,
      `Trend: ${gap.trend}`,
      `Confidence in this read: ${gap.confidence}`,
      "",
      "Write one or two short, plain-language sentences for a student explaining what this evidence shows and why it matters for their target role.",
      "Rules: use only the numbers given above, never claim certainty the confidence level doesn't support, never use discouraging language, do not invent achievements or history.",
    ].join("\n");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: 200,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      throw new Error(`LLM explanation request failed with status ${res.status}`);
    }

    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content?.find((block) => block.type === "text")?.text?.trim();
    if (!text) {
      throw new Error("LLM explanation response had no text content");
    }
    return text;
  }
}

/**
 * Wraps whichever provider is configured with a guaranteed fallback to
 * the deterministic template, and logs (does not throw) on failure.
 */
export class FallbackExplanationProvider implements ExplanationProvider {
  private readonly template = new TemplateExplanationProvider();

  constructor(private readonly primary: ExplanationProvider | null) {}

  async explain(gap: CapabilityGap): Promise<string> {
    if (!this.primary) return this.template.explain(gap);
    try {
      return await this.primary.explain(gap);
    } catch (err) {
      console.error("[explanation] primary provider failed, falling back to template:", (err as Error).message);
      return this.template.explain(gap);
    }
  }
}

export function buildExplanationProvider(env: NodeJS.ProcessEnv): ExplanationProvider {
  const enabled = env.USE_LLM_EXPLANATIONS === "true";
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!enabled || !apiKey) {
    return new FallbackExplanationProvider(null);
  }
  const model = env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5";
  return new FallbackExplanationProvider(new LlmExplanationProvider({ apiKey, model }));
}
