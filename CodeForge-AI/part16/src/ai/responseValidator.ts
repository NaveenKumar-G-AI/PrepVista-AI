import { AIAnalysisResponseSchema } from "../domain/schema.js";
import { ConfidenceLevel } from "../domain/enums.js";
import type { AIAnalysisResult, AIFinding } from "../domain/types.js";
import { confidenceFromEvidenceCount } from "../deterministic/confidence.js";

export type ValidationResult =
  | { ok: true; result: AIAnalysisResult; droppedFindings: number }
  | { ok: false; reason: string };

/**
 * Strict-parses raw model output, then enforces evidence grounding:
 * any finding/requirementNote that cites an evidenceId not present in
 * `offeredEvidenceIds` is DROPPED (not kept with a caveat) — an
 * unverifiable claim is worse than no claim (see EVIDENCE GROUNDING spec).
 * Findings that keep only some real evidence ids have their confidence
 * recomputed from the *actual* grounded count rather than trusting the
 * model's self-reported confidence.
 */
export function validateAndGround(rawText: string, offeredEvidenceIds: string[]): ValidationResult {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(stripCodeFences(rawText));
  } catch {
    return { ok: false, reason: "Response was not valid JSON" };
  }

  const parsed = AIAnalysisResponseSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return { ok: false, reason: `Schema validation failed: ${parsed.error.issues.map((i) => i.message).join("; ")}` };
  }

  const evidenceSet = new Set(offeredEvidenceIds);
  let dropped = 0;

  const groundedFindings: AIFinding[] = [];
  for (const f of parsed.data.findings) {
    const realIds = f.evidenceIds.filter((id) => evidenceSet.has(id));
    if (realIds.length === 0) {
      dropped += 1;
      continue; // unverifiable claim — drop entirely rather than surface it with a caveat
    }
    const fakeCount = f.evidenceIds.length - realIds.length;
    groundedFindings.push({
      claim: f.claim,
      evidenceIds: realIds,
      confidence: fakeCount > 0 ? ConfidenceLevel.LOW : confidenceFromEvidenceCount(realIds.length, 0),
    });
  }

  const groundedNotes = parsed.data.requirementNotes
    .map((n) => ({ ...n, evidenceIds: n.evidenceIds.filter((id) => evidenceSet.has(id)) }))
    .filter((n) => n.evidenceIds.length > 0 || n.note.length > 0); // notes may reference the requirement itself even w/o test evidence

  const rootCause = parsed.data.rootCause
    ? {
        layer: parsed.data.rootCause.layer,
        description: parsed.data.rootCause.description,
        affectedRegions: parsed.data.rootCause.affectedRegions,
      }
    : null;

  return {
    ok: true,
    droppedFindings: dropped,
    result: {
      statusAssessment: parsed.data.statusAssessment,
      explanationConfidence: parsed.data.explanationConfidence,
      summary: parsed.data.summary,
      findings: groundedFindings,
      requirementNotes: groundedNotes,
      rootCause,
      recommendedNextAction: parsed.data.recommendedNextAction,
    },
  };
}

/** Some models wrap JSON in ```json fences despite instructions not to; strip defensively. */
function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  return fenceMatch ? fenceMatch[1]! : trimmed;
}
