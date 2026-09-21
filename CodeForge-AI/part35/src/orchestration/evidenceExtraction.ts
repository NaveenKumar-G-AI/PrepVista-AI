import type { ConfidenceBand, EvidenceState, SkillEvidenceRecord } from "../domain/types.js";
import type { SkillProgress } from "./coverageTracker.js";

/**
 * Evidence state is derived purely from the strongest confidence actually
 * observed for that skill — independent of the blueprint's "sufficient
 * evidence" stopping threshold, which only governs when to stop asking, not
 * what label the resulting evidence deserves.
 */
export function evidenceStateFor(confidence: ConfidenceBand | null): EvidenceState {
  if (confidence === "HIGH") return "VERIFIED";
  if (confidence === "MODERATE") return "PARTIALLY_VERIFIED";
  if (confidence === "LOW") return "UNCERTAIN";
  return "UNASSESSED";
}

export function extractSkillEvidence(
  perSkillProgress: Record<string, SkillProgress & { supportingEvaluationIds: string[] }>
): SkillEvidenceRecord[] {
  const records: SkillEvidenceRecord[] = [];
  for (const [skill, progress] of Object.entries(perSkillProgress)) {
    if (progress.questionsAsked === 0) continue; // §11/§29 — never emit evidence for a skill that was never actually assessed
    records.push({
      skill,
      evidenceState: evidenceStateFor(progress.highestConfidence),
      confidence: progress.highestConfidence ?? "LOW",
      supportingEvaluationIds: progress.supportingEvaluationIds,
    });
  }
  return records;
}
