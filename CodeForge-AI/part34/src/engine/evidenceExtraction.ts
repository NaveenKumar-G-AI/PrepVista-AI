// ============================================================================
// Phase 44 — "Interview evidence must be skill-specific... These are
// evidence signals. They are not direct mastery scores."
// Phase 45 — send evidence to the existing Skill Signal Engine; do not
// implement a second mastery calculator. (The actual submission call lives
// in orchestration/completeSession.ts — this file only shapes the payload.)
// ============================================================================

import { asSkillEvidenceId, type Evaluation, type SessionId, type SkillCoverageEntry, type SkillEvidence } from "../domain/types.js";

/**
 * One skill's evaluations (already filtered to this session + this skill) ->
 * one SkillEvidence record. Confidence and evidenceState are read straight
 * from the coverage entry, which is itself derived only from
 * questions-asked + evaluation outcomes (coverage.ts) — this function does
 * not recompute or override that; it packages it for the Skill Signal
 * Engine.
 */
export function extractSkillEvidence(sessionId: SessionId, coverageEntry: SkillCoverageEntry, evaluations: Evaluation[]): SkillEvidence {
  const okEvaluations = evaluations.filter((e) => e.status === "OK");
  const sourceEvaluationIds = okEvaluations.map((e) => e.id);

  return {
    id: asSkillEvidenceId(`se_${sessionId}_${coverageEntry.skillId}`),
    sessionId,
    skillId: coverageEntry.skillId,
    evidenceState: coverageEntry.currentEvidenceState,
    confidence: coverageEntry.currentConfidence,
    sourceEvaluationIds,
    summary: buildSummary(coverageEntry, okEvaluations),
    extractedAt: new Date().toISOString(),
  };
}

function buildSummary(coverageEntry: SkillCoverageEntry, evaluations: Evaluation[]): string {
  if (evaluations.length === 0) {
    return `No usable evaluation for ${coverageEntry.skillId} in this session (evidence state: ${coverageEntry.currentEvidenceState}).`;
  }
  const strongCount = evaluations.filter((e) => e.adaptiveSignal === "STRONG").length;
  const weakCount = evaluations.filter((e) => e.adaptiveSignal === "WEAK").length;
  const contradictionCount = evaluations.filter((e) => e.adaptiveSignal === "CONTRADICTION").length;

  const parts = [`${evaluations.length} question(s) evaluated for ${coverageEntry.skillId}.`];
  if (strongCount > 0) parts.push(`${strongCount} strong response(s).`);
  if (weakCount > 0) parts.push(`${weakCount} weak response(s).`);
  if (contradictionCount > 0) parts.push(`${contradictionCount} potential inconsistency flag(s) — see individual evaluations, not auto-labeled as dishonesty.`);
  parts.push(`Follow-up depth reached: ${coverageEntry.followUpDepth}.`);
  return parts.join(" ");
}
