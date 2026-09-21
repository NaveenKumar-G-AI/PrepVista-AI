import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

const SYSTEM_PROMPT = `You are a coaching voice inside an aptitude-readiness product. You will be given a
factual, already-computed explanation of a student's readiness, produced entirely by
deterministic code. Your ONLY job is to rewrite it in warmer, more natural prose.

Hard rules:
- Do not introduce any number, percentage, count, or date that is not already present in the
  input text.
- Do not add claims, causes, or interpretations that are not already present in the input text.
- Do not soften or remove a gap or risk that the input text names.
- Keep it concise: roughly the same length as the input, a short paragraph or two.
- Never diagnose a psychological or medical condition.
- Output plain text only, no markdown headers.`;

/**
 * Rewords `templateText` (already fully computed by src/ai/templateExplainer.ts)
 * into more natural prose. Returns null on any error or missing key — callers
 * fall back to the deterministic template, which is a complete, correct
 * explanation on its own (Section 46: AI is optional polish, never the
 * source of the numbers).
 */
export async function polishExplanation(templateText: string): Promise<string | null> {
  const anthropic = getClient();
  if (!anthropic) return null;

  try {
    const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
    const response = await anthropic.messages.create({
      model,
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: templateText }],
    });
    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
    return textBlock?.text?.trim() || null;
  } catch (err) {
    console.error("Anthropic explanation polish failed, falling back to template text:", err);
    return null;
  }
}
