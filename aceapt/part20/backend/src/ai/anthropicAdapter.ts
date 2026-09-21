import "dotenv/config";
import type { SessionEvidence } from "../engine/analytics.js";
import { NARRATIVE_SYSTEM_PROMPT, COACH_SYSTEM_PROMPT } from "./prompts.js";
import { buildFallbackNarrative, buildFallbackCoachAnswer } from "./fallbackNarratives.js";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export interface AiResult {
  text: string;
  source: "ai" | "fallback";
}

/**
 * Trims the full internal evidence object down to what the AI actually
 * needs, keeping the prompt small and — more importantly — keeping fields
 * like raw event logs and internal thresholds out of what gets sent
 * off-server (spec §59 security: don't leak more than necessary).
 */
function compactEvidence(ev: SessionEvidence) {
  return {
    score: ev.score,
    maxScore: ev.maxScore,
    accuracyPct: ev.accuracyPct,
    attemptRatePct: ev.attemptRatePct,
    totalTimeSec: ev.totalTimeSec,
    avgTimePerQuestionSec: Math.round(ev.avgTimePerQuestionSec),
    segments: ev.segments,
    biggestLeak: ev.biggestLeak,
    overinvestedQuestions: ev.overinvested.map((p) => ({
      question: p.sequenceIndex + 1,
      concept: p.concept,
      difficulty: p.difficulty,
      timeSec: p.timeSec,
      result: p.status,
    })),
    opportunityCostEquivalentQuestions: ev.opportunityCostEquivalentQuestions,
    recoveryRatePct: ev.recoveryRatePct,
    postErrorAccuracyPct: ev.postErrorAccuracyPct,
    selectionQuality: ev.selectionQuality,
    speedAccuracyProfile: ev.speedAccuracyProfile,
    navigationJumps: ev.navigationJumps,
  };
}

async function callAnthropic(system: string, userMessage: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: 500,
        system,
        messages: [{ role: "user", content: userMessage }],
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[ai] Anthropic API returned ${res.status}; falling back to deterministic template.`);
      return null;
    }

    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = data.content
      ?.filter((b) => b.type === "text" && b.text)
      .map((b) => b.text)
      .join("\n")
      .trim();

    return text || null;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[ai] Anthropic call failed; falling back to deterministic template.", (err as Error).message);
    return null;
  }
}

export async function generateNarrative(ev: SessionEvidence): Promise<AiResult> {
  const aiText = await callAnthropic(NARRATIVE_SYSTEM_PROMPT, JSON.stringify(compactEvidence(ev)));
  if (aiText) return { text: aiText, source: "ai" };
  return { text: buildFallbackNarrative(ev), source: "fallback" };
}

const COACH_QUESTIONS: Record<string, string> = {
  analyze: "Analyze my test overall.",
  time: "Why did I lose time?",
  skip: "Which questions should I have skipped?",
  drop: "Where did my performance drop?",
};

export async function answerCoachQuestion(promptKey: string, ev: SessionEvidence): Promise<AiResult> {
  const question = COACH_QUESTIONS[promptKey] || promptKey;
  const userMessage = `Question: ${question}\n\nEvidence: ${JSON.stringify(compactEvidence(ev))}`;
  const aiText = await callAnthropic(COACH_SYSTEM_PROMPT, userMessage);
  if (aiText) return { text: aiText, source: "ai" };
  return { text: buildFallbackCoachAnswer(promptKey, ev), source: "fallback" };
}
