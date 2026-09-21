import { Capability, Differentiator, PositioningStrength, TargetRole } from "../types/domain";

export interface NarrativeInput {
  role: TargetRole;
  strongestEvidence: Capability[];
  differentiators: Differentiator[];
  positioningStrength: PositioningStrength;
}

export interface NarrativeResult {
  text: string;
  source: "ai" | "template-fallback";
}

export interface NarrativePort {
  composePositionStatement(input: NarrativeInput): Promise<NarrativeResult>;
}

function joinNatural(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * Default adapter. Zero configuration, zero external calls, zero risk of
 * inventing a fact — it only ever rearranges fields already computed from
 * real evidence. This is what the engine falls back to whenever the AI
 * adapter below is unavailable, unset, or errors (spec section 71).
 */
export class TemplateNarrativeAdapter implements NarrativePort {
  async composePositionStatement(input: NarrativeInput): Promise<NarrativeResult> {
    const top = input.strongestEvidence.slice(0, 4).map((c) => c.name);
    const base = top.length
      ? `${input.role.name} focused on ${joinNatural(top)}.`
      : `Working toward ${input.role.name}, with evidence still developing.`;

    const differentiator = input.differentiators[0]?.description;
    const text = differentiator ? `${base} Differentiated by ${differentiator.toLowerCase()}.` : base;

    return { text, source: "template-fallback" };
  }
}

/**
 * Optional adapter. Only activates if ANTHROPIC_API_KEY is set. The prompt
 * hands the model ONLY facts already computed from real evidence and
 * explicitly forbids adding anything (spec section 47: AI is responsible for
 * natural-language generation, never for inventing evidence). Any failure —
 * missing key, network error, empty response — falls straight back to the
 * deterministic template, so positioning generation is never blocked on an
 * external call.
 */
export class AnthropicNarrativeAdapter implements NarrativePort {
  constructor(private fallback: NarrativePort = new TemplateNarrativeAdapter()) {}

  async composePositionStatement(input: NarrativeInput): Promise<NarrativeResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return this.fallback.composePositionStatement(input);

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
          max_tokens: 200,
          messages: [{ role: "user", content: buildPrompt(input) }],
        }),
      });

      if (!response.ok) {
        throw new Error(`Anthropic API responded with ${response.status}`);
      }

      const data = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
      const text = data.content?.find((b) => b.type === "text")?.text?.trim();
      if (!text) throw new Error("Empty narrative response from AI");

      return { text, source: "ai" };
    } catch (err) {
      console.warn(
        "[narrativePort] AI narrative unavailable, using deterministic fallback:",
        (err as Error).message
      );
      return this.fallback.composePositionStatement(input);
    }
  }
}

function buildPrompt(input: NarrativeInput): string {
  return [
    "Write exactly one sentence (max 30 words) describing a student's professional positioning for a job search.",
    "Use ONLY the facts listed below. Do not invent skills, employers, metrics, or achievements.",
    `Target role: ${input.role.name}`,
    `Strongest evidenced capabilities: ${input.strongestEvidence.map((c) => c.name).join(", ") || "none yet"}`,
    `Differentiator (if any): ${input.differentiators[0]?.description ?? "none yet"}`,
    "Reply with only the sentence and nothing else.",
  ].join("\n");
}

export const narrativePort: NarrativePort = process.env.ANTHROPIC_API_KEY
  ? new AnthropicNarrativeAdapter()
  : new TemplateNarrativeAdapter();
