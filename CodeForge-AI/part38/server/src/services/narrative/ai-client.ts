/**
 * Real Anthropic Messages API call — this file runs in the user's own
 * backend process, NOT inside a claude.ai artifact sandbox, so (unlike
 * artifact-embedded API calls) it must send its own auth headers. Reads
 * the key from the environment; per the brief's instruction, that env var
 * is intentionally left blank in .env.example. See guardrail.ts and
 * narrative-service.ts for what happens when it's unset or the call fails
 * — the feature keeps working either way (brief §38).
 */

export class AiUnavailableError extends Error {
  constructor(reason: string) {
    super(`AI narrative unavailable: ${reason}`);
    this.name = "AiUnavailableError";
  }
}

export interface NarrativeFacts {
  studentName: string;
  overallMastery: string | null;
  targetRole: string | null;
  roleReadiness: string | null;
  skills: { name: string; level: string; trend: string }[];
  strengths: { title: string; skill: string }[];
  weaknesses: { title: string; impact: string; recommendedAction: string }[];
  nextBestAction: string | null;
  hasProjectEvidence: boolean;
  hasInterviewEvidence: boolean;
  hasGrowthData: boolean;
}

export interface RawNarrativeResult {
  executiveSummary: string;
  strengthsNarrative: string;
  weaknessesNarrative: string;
  growthNarrative: string;
}

const SYSTEM_PROMPT = `You write a short, professional narrative for a student's technical mastery report.

STRICT RULES:
- Use ONLY the facts given to you in the user message. Do not add any skill, level, project, interview, or event that isn't present.
- Never state a mastery level or role readiness for a skill/role other than exactly what is given.
- If project evidence is not present, do not claim the student built or shipped a project.
- If interview evidence is not present, do not claim the student took or passed a technical interview.
- If growth data is insufficient, say so plainly rather than describing a trend.
- Be constructive and specific; avoid generic praise or generic criticism.
- Respond with ONLY a JSON object, no markdown fences, no commentary, matching exactly:
  {"executiveSummary": string, "strengthsNarrative": string, "weaknessesNarrative": string, "growthNarrative": string}`;

export async function generateNarrativeViaAi(facts: NarrativeFacts): Promise<RawNarrativeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AiUnavailableError("ANTHROPIC_API_KEY is not set");
  }
  const model = process.env.ANTHROPIC_MODEL;
  if (!model) {
    throw new AiUnavailableError("ANTHROPIC_MODEL is not set");
  }

  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: JSON.stringify(facts) }],
      }),
    });
  } catch (err) {
    throw new AiUnavailableError(`network error: ${(err as Error).message}`);
  }

  if (!response.ok) {
    throw new AiUnavailableError(`API returned ${response.status}`);
  }

  const body = (await response.json()) as { content?: { type: string; text?: string }[] };
  const textBlock = body.content?.find((b) => b.type === "text")?.text;
  if (!textBlock) throw new AiUnavailableError("no text block in response");

  let parsed: unknown;
  try {
    parsed = JSON.parse(textBlock);
  } catch {
    throw new AiUnavailableError("response was not valid JSON");
  }

  const result = parsed as Partial<RawNarrativeResult>;
  if (
    typeof result.executiveSummary !== "string" ||
    typeof result.strengthsNarrative !== "string" ||
    typeof result.weaknessesNarrative !== "string" ||
    typeof result.growthNarrative !== "string"
  ) {
    throw new AiUnavailableError("response JSON missing required narrative fields");
  }
  return result as RawNarrativeResult;
}
