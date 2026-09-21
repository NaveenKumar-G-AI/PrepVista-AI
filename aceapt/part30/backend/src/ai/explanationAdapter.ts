import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config";

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export interface ExplanationRequest {
  /** What kind of moment this is -- shapes tone, not content. */
  kind: "bottleneck" | "path_change" | "weekly_review" | "next_action" | "risk" | "skip_consequence";
  /** The deterministic facts already computed elsewhere. The model may only rephrase these. */
  facts: Record<string, unknown>;
  /** Deterministic template output -- always correct, always the fallback, always what's used if no API key or the call fails. */
  fallbackText: string;
}

const SYSTEM_PROMPT = `You phrase already-computed facts from ACEAPT PATH, a student exam-readiness system, into brief, warm, plain-spoken explanations for a student.

Hard rules:
- You are NOT the source of truth. Every number, capability name, and status in "facts" is already correct and final.
- Never invent, adjust, round differently, or guess any number, date, or name beyond what is given in "facts".
- Never promise a guaranteed outcome or date.
- 1-3 sentences. Plain, active-voice, sentence case. No filler, no exclamation points, no emoji, no apology.
- Write in the interface's voice: direct, never punitive, never falsely upbeat.
- Output only the explanation text, nothing else.`;

/**
 * Section 55: "LLMs may be used for explanations, personalization,
 * natural-language summaries, action rationale, reflection assistance.
 * LLMs must NOT be the source of truth." The caller always has a valid
 * `fallbackText` computed by deterministic engine code before this is
 * ever invoked -- this function can only make that text warmer/more
 * personalized, never supply a fact the deterministic layer didn't.
 */
export async function explain(req: ExplanationRequest): Promise<string> {
  const anthropic = getClient();
  if (!anthropic) return req.fallbackText;

  try {
    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
      max_tokens: 200,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `kind: ${req.kind}\nfacts: ${JSON.stringify(req.facts)}\n\nRephrase these facts for the student in 1-3 sentences.`,
        },
      ],
    });
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .trim();
    return text.length > 0 ? text : req.fallbackText;
  } catch (err) {
    // AI layer failing must never break the product -- the deterministic
    // fallback is not a degraded experience, it's the same facts in a
    // plainer voice.
    console.error("explanationAdapter: falling back to deterministic text", err);
    return req.fallbackText;
  }
}
