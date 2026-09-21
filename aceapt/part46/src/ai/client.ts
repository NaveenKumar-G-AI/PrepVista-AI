import { env } from "../config/env";
import { AiOutputContract, safeParseAiOutput } from "./outputValidator";

/**
 * IMPORTANT SCOPE NOTE (see README "Design choice: what the AI is allowed to
 * decide"): every classification, state transition, and teaching action in
 * this engine is 100% deterministic (domain/*.ts). The AI, when configured,
 * is used for exactly two things:
 *   1. Rephrasing an already-decided tutor message so it reads naturally.
 *   2. A second, more generous opinion on a teach-back answer.
 * It can never change what happens next, never invents numbers, and any
 * malformed/unexpected output is discarded in favor of the deterministic
 * template (sections 66/67/93 of the spec).
 */

const REPHRASE_SYSTEM_PROMPT = `You are the wording layer for a Socratic tutoring engine inside ACEAPT, an aptitude-exam coaching product.
A deterministic teaching engine has ALREADY decided the pedagogical action, the intent, and the factual content of the next message.
Your only job is to rephrase the given base message so it reads naturally and warmly for a student preparing for placement exams.

Hard rules:
- Do not change the pedagogical action.
- Do not reveal any number that is not already present in the base message.
- Do not invent facts, numbers, or claims about the student's history.
- Keep it to 1-3 short sentences, plain language, encouraging but not effusive. No emoji.
- Respond with ONLY a single JSON object, no markdown fences, no commentary, matching exactly this shape:
{"action": "<echo the given action exactly>", "message": "<your rephrasing>"}`;

const TEACHBACK_SYSTEM_PROMPT = `You are a second-opinion grader for a Socratic tutoring engine.
A deterministic keyword check has already scored a student's teach-back explanation against a list of success criteria and found some criteria unmet.
Look ONLY at the criteria the deterministic check marked as NOT met, and decide, generously but honestly, whether the student's explanation actually does satisfy each one even though it used different words.
You may only ADD criteria as met. You must never mark a criterion the deterministic check found unmet as met unless the student's text genuinely supports it.
Respond with ONLY a single JSON object, no markdown fences, no commentary, matching exactly this shape:
{"action": "REFLECT", "criteriaMet": {"<criterion_id>": true|false}, "message": "<one short sentence of feedback for the student>"}
Include every id from unmetCriteria as a key in criteriaMet.`;

interface RephraseRequest {
  action: AiOutputContract["action"];
  baseMessage: string;
  intent: string;
  skill: string;
  helpLevel: number;
}

async function callAnthropic(system: string, userContent: string): Promise<string | null> {
  if (!env.anthropicApiKey) return null;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: env.anthropicModel,
        max_tokens: 300,
        system,
        messages: [{ role: "user", content: userContent }],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    const data: any = await res.json();
    const textBlock = Array.isArray(data.content) ? data.content.find((b: any) => b.type === "text") : null;
    return textBlock?.text ?? null;
  } catch {
    return null;
  }
}

/** Returns a validated AiOutputContract whose `action` matches the request,
 *  or null if the AI is unavailable / disabled / returned anything invalid.
 *  Callers must fall back to the deterministic base message on null. */
export async function getTutorMessage(req: RephraseRequest): Promise<AiOutputContract | null> {
  const userContent = JSON.stringify({
    action: req.action,
    intent: req.intent,
    skill: req.skill,
    helpLevel: req.helpLevel,
    baseMessage: req.baseMessage,
  });
  const raw = await callAnthropic(REPHRASE_SYSTEM_PROMPT, userContent);
  if (!raw) return null;
  const parsed = safeParseAiOutput(raw);
  if (!parsed || parsed.action !== req.action) return null;
  return parsed;
}

export interface TeachBackOpinionRequest {
  studentText: string;
  unmetCriteria: string[];
}

/** Returns a set of criterion ids the AI additionally believes are met, or
 *  an empty array if unavailable/invalid. Never returns anything the caller
 *  didn't ask about, and never removes a deterministic pass. */
export async function getTeachBackSecondOpinion(req: TeachBackOpinionRequest): Promise<string[]> {
  if (req.unmetCriteria.length === 0) return [];
  const userContent = JSON.stringify({ studentText: req.studentText, unmetCriteria: req.unmetCriteria });
  const raw = await callAnthropic(TEACHBACK_SYSTEM_PROMPT, userContent);
  if (!raw) return [];
  // This response intentionally uses a slightly different shape (criteriaMet
  // map) layered on top of the base contract, so we parse it directly here
  // rather than forcing it through the generic action/message validator.
  try {
    const stripped = raw
      .trim()
      .replace(/^```(json)?/i, "")
      .replace(/```$/i, "")
      .trim();
    const parsed = JSON.parse(stripped);
    if (parsed && parsed.action === "REFLECT" && parsed.criteriaMet && typeof parsed.criteriaMet === "object") {
      return Object.entries(parsed.criteriaMet)
        .filter(([k, v]) => req.unmetCriteria.includes(k) && v === true)
        .map(([k]) => k);
    }
    return [];
  } catch {
    return [];
  }
}
