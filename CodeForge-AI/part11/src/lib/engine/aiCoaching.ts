import { AiCoachingFeedback, CategoryScores, EvaluationResult, IncidentTemplate } from "./types";

/**
 * AI is used for exactly one thing in this system: turning an already
 * -finalized, already-deterministic evaluation into readable qualitative
 * coaching. It never computes scores, never decides incident state, and
 * never determines root cause — see scoring.ts / stateMachine.ts, which
 * have no AI dependency at all and are unit-tested without any API key.
 *
 * Grounding: the prompt receives ONLY the structured evidence computed
 * by the deterministic engine (category scores + which evidence keys
 * were/weren't matched + which cause key was confirmed). The model is
 * instructed to comment solely on that evidence and to say so explicitly
 * when a category has too little signal to say anything specific. This
 * reduces hallucination risk but does not eliminate it — the deterministic
 * scores remain authoritative regardless of what the model says, and nothing
 * downstream (mastery evidence, state, scores) reads back from AI output.
 */

export interface CoachingEvidenceBundle {
  incidentTitle: string;
  difficulty: string;
  categoryScores: CategoryScores;
  engineeringJudgment: number;
  overall: number;
  correctRootCauseIdentified: boolean;
  rootCauseSummary: string; // safe to reveal post-evaluation
  evidenceCoveragePct: number;
  mitigationUsed: string | null;
  permanentFixUsed: string | null;
  postmortemSubmitted: boolean;
  fiveWhysCompletedCount: number;
}

const SYSTEM_PROMPT = `You are a staff engineer giving post-incident coaching to a junior engineer who just
finished a production-incident simulation. You will be given ONLY structured, already-verified evidence about
what they did. Do not invent facts, numbers, or events that are not present in the evidence. If a category's
evidence is too sparse to say something specific and true, write exactly "Insufficient evidence" for that
category instead of guessing.

Respond ONLY with a JSON array (no prose, no markdown fences) of 3 to 5 objects, each with exactly these string
fields: "observation", "evidence", "impact", "recommendation", "example". Cover the strongest area, the weakest
area, and root-cause reasoning at minimum. Keep each field to 1-2 sentences. Be specific and concrete, never
generic ("communicate better" is not acceptable; cite the actual evidence given).`;

function buildUserPrompt(bundle: CoachingEvidenceBundle): string {
  return JSON.stringify(bundle, null, 2);
}

function parseModelJson(text: string): AiCoachingFeedback["sections"] | null {
  try {
    const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "");
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return null;
    const sections = parsed
      .filter(
        (s) =>
          s &&
          typeof s.observation === "string" &&
          typeof s.evidence === "string" &&
          typeof s.impact === "string" &&
          typeof s.recommendation === "string" &&
          typeof s.example === "string"
      )
      .slice(0, 5);
    return sections.length > 0 ? sections : null;
  } catch {
    return null;
  }
}

async function callGroq(bundle: CoachingEvidenceBundle): Promise<AiCoachingFeedback["sections"] | null> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  const model = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        max_tokens: 900,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: buildUserPrompt(bundle) },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = data?.choices?.[0]?.message?.content;
    return typeof text === "string" ? parseModelJson(text) : null;
  } catch {
    return null;
  }
}

async function callGemini(bundle: CoachingEvidenceBundle): Promise<AiCoachingFeedback["sections"] | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: buildUserPrompt(bundle) }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 900 },
        }),
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return typeof text === "string" ? parseModelJson(text) : null;
  } catch {
    return null;
  }
}

function fallbackFeedback(bundle: CoachingEvidenceBundle): AiCoachingFeedback {
  const entries = Object.entries(bundle.categoryScores);
  const weakest = entries.slice().sort((a, b) => a[1] - b[1])[0]!; // categoryScores always has 8 fixed keys
  const strongest = entries.slice().sort((a, b) => b[1] - a[1])[0]!;
  return {
    source: "fallback",
    sections: [
      {
        observation: `Root cause: ${bundle.correctRootCauseIdentified ? "correctly identified and confirmed" : "not confirmed correctly"}.`,
        evidence: `${Math.round(bundle.evidenceCoveragePct)}% of the expected evidence for this incident was cited and actually inspected.`,
        impact: bundle.correctRootCauseIdentified
          ? "Confirming the true root cause (not just the first plausible guess) is what separates a resolved incident from a recurring one."
          : "Without a confirmed root cause, the permanent fix (if any) may not address why this happened.",
        recommendation: bundle.correctRootCauseIdentified
          ? "Keep attaching specific evidence IDs to hypotheses before confirming them — that habit is what made this one hold up."
          : "Before confirming a root-cause hypothesis, attach at least two pieces of evidence that specifically point to it.",
        example: "Attach the slow-query log line and the trace span that shows the database call dominating latency, not just the alert.",
      },
      {
        observation: `Strongest area this run: ${strongest[0]} (${strongest[1]}/100).`,
        evidence: `Weakest area: ${weakest[0]} (${weakest[1]}/100).`,
        impact: "Category scores reflect the process you used (what you checked, in what order, with what evidence), not just whether the incident ended resolved.",
        recommendation: `Focus your next attempt on ${weakest[0]}.`,
        example: "Insufficient evidence for a concrete example in this fallback summary — connect an AI provider for a more specific one.",
      },
    ],
  };
}

export async function generateCoaching(bundle: CoachingEvidenceBundle): Promise<AiCoachingFeedback> {
  const provider = (process.env.AI_PROVIDER || "groq").toLowerCase();
  const sections =
    provider === "gemini" ? await callGemini(bundle) : await callGroq(bundle);

  if (sections) {
    return { source: "ai", sections };
  }
  // AI unavailable, misconfigured, or returned something unparseable —
  // core simulation and scoring already happened deterministically above
  // this call, so we degrade to a templated summary instead of failing.
  return fallbackFeedback(bundle);
}

export function buildCoachingBundle(
  template: IncidentTemplate,
  evaluation: EvaluationResult,
  correctRootCauseIdentified: boolean,
  mitigationActionType: string | null,
  permanentFixActionType: string | null,
  postmortemSubmitted: boolean,
  fiveWhysCompletedCount: number
): CoachingEvidenceBundle {
  return {
    incidentTitle: template.title,
    difficulty: template.difficulty,
    categoryScores: evaluation.categoryScores,
    engineeringJudgment: evaluation.engineeringJudgment,
    overall: evaluation.overall,
    correctRootCauseIdentified,
    rootCauseSummary: template.rootCauseSummary,
    evidenceCoveragePct: evaluation.categoryScores.evidenceQuality,
    mitigationUsed: mitigationActionType,
    permanentFixUsed: permanentFixActionType,
    postmortemSubmitted,
    fiveWhysCompletedCount,
  };
}
