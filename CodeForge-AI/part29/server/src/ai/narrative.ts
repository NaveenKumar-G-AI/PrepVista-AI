/**
 * AI narrative generation for growth explanations.
 *
 * The contract is deliberately narrow: the AI (or the template fallback)
 * receives only verified, structured facts already computed by the engine.
 * It is never given raw access to "make up a number" — every field below
 * is something the engine already calculated and the caller already has.
 * This is what "the AI must not invent unsupported numbers" means in
 * practice: the numbers exist before the AI is called, and the AI's job is
 * strictly to phrase them.
 *
 * AI_PROVIDER=none (the default, and what .env.example ships with) uses
 * generateTemplateNarrative() below and never makes a network call. Set
 * AI_PROVIDER=groq or =gemini and provide the matching API key to use a
 * live model instead — see callGroq / callGemini. Neither is exercised in
 * this environment: this sandbox's network egress does not include
 * api.groq.com or generativelanguage.googleapis.com, so those two
 * functions are real, complete, and untested-against-a-live-endpoint here.
 * Whichever path is used, the result should be cached (growth_reports.ai_narrative)
 * rather than regenerated on every dashboard load.
 */

export interface GrowthNarrativeFacts {
  studentFirstName: string;
  skillName: string;
  baseline: number;
  current: number;
  absoluteChange: number;
  confidence: string;
  evidenceCount: number;
  successfulChallengeCount?: number;
  transferEvidence?: boolean;
  milestoneDescriptions?: string[];
  trend?: "IMPROVING" | "STABLE" | "PLATEAU" | "DECLINING" | "INSUFFICIENT_EVIDENCE";
}

export interface NarrativeResult {
  text: string;
  provider: "template" | "groq" | "gemini";
}

function factsToPrompt(facts: GrowthNarrativeFacts): string {
  return [
    "You explain a student's measured technical growth in 2-3 sentences.",
    "Use ONLY the facts given below. Do not invent numbers, evidence, or causal claims",
    'stronger than "associated with" / "during this period". Avoid hype.',
    "",
    `Skill: ${facts.skillName}`,
    `Baseline: ${facts.baseline}`,
    `Current: ${facts.current}`,
    `Change: ${facts.absoluteChange >= 0 ? "+" : ""}${facts.absoluteChange}`,
    `Confidence: ${facts.confidence}`,
    `Evidence count: ${facts.evidenceCount}`,
    facts.successfulChallengeCount != null
      ? `Successful challenges backing this: ${facts.successfulChallengeCount}`
      : "",
    facts.transferEvidence ? "Includes at least one successful transfer to an unfamiliar context." : "",
    facts.milestoneDescriptions?.length
      ? `Milestones achieved: ${facts.milestoneDescriptions.join("; ")}`
      : "",
    facts.trend ? `Trend classification: ${facts.trend}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Deterministic, non-AI narrative. Always available, always free, and — by
 * construction — incapable of inventing a number that isn't in `facts`.
 * This is the default and the safe fallback if a live provider call fails.
 */
export function generateTemplateNarrative(facts: GrowthNarrativeFacts): NarrativeResult {
  const direction =
    facts.absoluteChange > 0 ? "improved" : facts.absoluteChange < 0 ? "declined" : "held steady";
  const magnitude = Math.abs(facts.absoluteChange);

  let text = `${facts.skillName} ${direction} by ${magnitude} point${magnitude === 1 ? "" : "s"} (from ${facts.baseline} to ${facts.current}), based on ${facts.evidenceCount} piece${facts.evidenceCount === 1 ? "" : "s"} of evidence — confidence: ${facts.confidence.toLowerCase()}.`;

  if (facts.successfulChallengeCount) {
    text += ` This includes ${facts.successfulChallengeCount} successful challenge${facts.successfulChallengeCount === 1 ? "" : "s"}.`;
  }
  if (facts.transferEvidence) {
    text += " The student has also successfully applied this skill in an unfamiliar context.";
  }
  if (facts.milestoneDescriptions?.length) {
    text += ` Milestones reached during this period: ${facts.milestoneDescriptions.join("; ")}.`;
  }

  return { text, provider: "template" };
}

async function callGroq(facts: GrowthNarrativeFacts, apiKey: string): Promise<NarrativeResult> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [{ role: "user", content: factsToPrompt(facts) }],
      max_tokens: 200,
      temperature: 0.3,
    }),
  });
  if (!response.ok) throw new Error(`Groq request failed: ${response.status}`);
  const data = (await response.json()) as any;
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Groq returned no content");
  return { text, provider: "groq" };
}

async function callGemini(facts: GrowthNarrativeFacts, apiKey: string): Promise<NarrativeResult> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: factsToPrompt(facts) }] }],
        generationConfig: { maxOutputTokens: 200, temperature: 0.3 },
      }),
    }
  );
  if (!response.ok) throw new Error(`Gemini request failed: ${response.status}`);
  const data = (await response.json()) as any;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!text) throw new Error("Gemini returned no content");
  return { text, provider: "gemini" };
}

/**
 * Entry point the API layer calls. Falls back to the template narrative if
 * no provider is configured, or if the configured provider call throws —
 * a flaky AI call should never take the growth dashboard down.
 */
export async function generateGrowthNarrative(facts: GrowthNarrativeFacts): Promise<NarrativeResult> {
  const provider = process.env.AI_PROVIDER ?? "none";
  try {
    if (provider === "groq" && process.env.GROQ_API_KEY) {
      return await callGroq(facts, process.env.GROQ_API_KEY);
    }
    if (provider === "gemini" && process.env.GEMINI_API_KEY) {
      return await callGemini(facts, process.env.GEMINI_API_KEY);
    }
  } catch (err) {
    console.error("[ai/narrative] provider call failed, falling back to template:", err);
  }
  return generateTemplateNarrative(facts);
}
