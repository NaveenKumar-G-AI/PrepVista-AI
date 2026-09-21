import { z } from "zod";
import { callGroqForJson } from "@/lib/ai/groqClient";
import type { AiGenerationStatus, AiNarrative, DiagnosticResult } from "@/lib/domain/types";

const AiNarrativeSchema = z.object({
  overallSummary: z.string().min(10).max(700),
  strengthsNarrative: z.string().min(5).max(500),
  focusAreasNarrative: z.string().min(5).max(500),
  rootCauseNarrative: z.string().max(500).nullable(),
  surpriseNarrative: z.string().max(500).nullable(),
  encouragement: z.string().min(5).max(400),
});

const SYSTEM_PROMPT = `
You are the narration layer for ACEAPT, an aptitude diagnostic tool. You will receive a JSON
object of ALREADY-COMPUTED diagnostic findings for one student. Your only job is to turn those
findings into warm, clear, encouraging, non-judgmental natural language.

Strict rules:
- Do not invent, guess, or add any number, skill name, or finding that is not already present
  in the JSON you are given. You are a narrator of given facts, not an analyst.
- Do not diagnose any psychological or medical condition, and do not speculate about effort,
  intelligence, or character.
- Do not claim certainty the data does not support — when a finding's confidence is "LOW" or
  evidence is limited, use hedged language such as "appears to" or "early evidence suggests".
- Do not tell the student they passed, failed, or are "ready" or "not ready" for anything —
  this is a starting-point diagnostic, not a pass/fail test.
- Output ONLY one JSON object with exactly these keys and no others, no markdown fences, no
  commentary before or after it:
  { "overallSummary": string, "strengthsNarrative": string, "focusAreasNarrative": string,
    "rootCauseNarrative": string | null, "surpriseNarrative": string | null, "encouragement": string }
`.trim();

/**
 * The single entry point the API layer calls. Always returns a usable
 * narrative — either AI-generated and schema-validated, or a genuine
 * deterministic one. The student never sees "AI failed" (spec section 64).
 */
export async function generateAiNarrative(
  result: DiagnosticResult
): Promise<{ narrative: AiNarrative; status: AiGenerationStatus }> {
  const raw = await callGroqForJson({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: JSON.stringify(buildFindingsPayload(result)),
  });

  if (raw) {
    try {
      const parsed = AiNarrativeSchema.parse(JSON.parse(stripCodeFences(raw)));
      return { narrative: parsed, status: "SUCCESS" };
    } catch (err) {
      console.error(
        "[interpretFindings] AI output failed schema validation — using deterministic fallback:",
        err instanceof Error ? err.message : err
      );
    }
  }

  return { narrative: buildDeterministicNarrative(result), status: "FALLBACK" };
}

function stripCodeFences(text: string): string {
  return text.trim().replace(/^```(json)?/i, "").replace(/```$/, "").trim();
}

/** Only already-computed findings are sent — the model never sees raw responses to interpret itself. */
function buildFindingsPayload(result: DiagnosticResult) {
  return {
    overallCapability: result.overallCapability,
    totalQuestions: result.totalQuestions,
    accuracyOverall: result.accuracyOverall,
    speedProfileOverall: result.speedProfileOverall,
    domainResults: result.domainResults,
    strengths: result.skillResults.filter((s) => result.strengths.includes(s.skillId)).map((s) => s.skillName),
    focusAreas: result.skillResults.filter((s) => result.focusAreas.includes(s.skillId)).map((s) => s.skillName),
    possibleRootCauses: result.possibleRootCauses,
    unexpectedFindings: result.unexpectedFindings,
    confidenceAlignment: result.confidenceAlignment,
    recommendedStartingPointReason: result.recommendedStartingPointReason,
  };
}

// -----------------------------------------------------------------------------
// Deterministic fallback — a real, complete narrative, not an error message.
// -----------------------------------------------------------------------------

const LEVEL_LABEL: Record<string, string> = {
  NOT_ASSESSED: "not yet assessed",
  LIMITED_EVIDENCE: "based on very limited evidence so far",
  EMERGING: "still emerging",
  DEVELOPING: "developing",
  FUNCTIONAL: "functional",
  STRONG: "strong",
  ADVANCED: "advanced",
  VERIFIED: "strong, and confirmed on a follow-up check",
};

export function buildDeterministicNarrative(result: DiagnosticResult): AiNarrative {
  const nameById = Object.fromEntries(result.skillResults.map((s) => [s.skillId, s.skillName]));
  const domainsTouched = result.domainResults.filter((d) => d.questionsAttempted > 0).length;

  const overallSummary = `Across ${result.totalQuestions} questions spanning ${domainsTouched} domain${domainsTouched === 1 ? "" : "s"}, your starting capability currently reads as ${LEVEL_LABEL[result.overallCapability] ?? result.overallCapability.toLowerCase()}. This is a starting point for ACEAPT to build on, not a final score.`;

  const strengthsNarrative =
    result.strengths.length > 0
      ? `The strongest evidence so far is in ${listNames(result.strengths, nameById)}.`
      : `No single area stood out as a clear strength yet — that's normal this early, and more practice will sharpen the picture.`;

  const focusAreasNarrative =
    result.focusAreas.length > 0
      ? `The clearest opportunities to focus on next are ${listNames(result.focusAreas, nameById)}.`
      : `No urgent focus area stood out in this diagnostic.`;

  const rootCauseNarrative =
    result.possibleRootCauses.length > 0 ? result.possibleRootCauses.map((rc) => rc.narrative).join(" ") : null;

  const surpriseNarrative =
    result.unexpectedFindings.length > 0 ? result.unexpectedFindings.map((f) => f.narrative).join(" ") : null;

  const encouragement =
    "This diagnostic is a starting point, not a judgment — every focus area found here is simply where practice will help you grow fastest next.";

  return { overallSummary, strengthsNarrative, focusAreasNarrative, rootCauseNarrative, surpriseNarrative, encouragement };
}

function listNames(ids: string[], nameById: Record<string, string>): string {
  const names = ids.map((id) => nameById[id] ?? id);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]!}`;
}
