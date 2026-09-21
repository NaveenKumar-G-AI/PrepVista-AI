import { SelectionAuditRecord, SelectionMode } from '../types';

/**
 * Deterministic, template-based explanations — no LLM call in the default
 * path. This matches the spec's cost-control requirement ("do not call an
 * LLM every time a challenge is selected") and its AI-boundary requirement
 * ("AI must not independently control ... hidden assessment rules"): the
 * explanation is always a direct readout of the audit record the
 * deterministic selector already produced, never a fresh generation that
 * could drift from what actually happened.
 *
 * An LLM MAY optionally be layered on top purely to polish prose for the
 * student-facing string in PRACTICE mode — never to decide what gets
 * revealed, and never in ASSESSMENT/INTERVIEW mode.
 */

export function explainForStudent(audit: SelectionAuditRecord, mode: SelectionMode): string {
  if (!audit.selected) {
    return "We don't have an eligible next challenge for you right now — this has been flagged for review.";
  }
  if (mode === 'ASSESSMENT') {
    // Assessment-integrity: never reveal skill-gap detail mid-assessment.
    return 'Challenge selected based on your current assessment path.';
  }
  if (mode === 'INTERVIEW') {
    return 'Challenge selected to match your target role and interview stage.';
  }
  return audit.selected.selectionReason;
}

export interface InstructorExplanation {
  primaryReason: string;
  evidenceSummary: string;
  relevantSkillGap: string;
  recentEvidenceCount: number;
  challengeObjective: string;
  difficultyComponents: Record<string, number> | null;
  curriculumAlignment: string;
  selectorVersion: string;
  weightsVersion: string;
}

export function explainForInstructor(audit: SelectionAuditRecord): InstructorExplanation | null {
  if (!audit.selected) return null;
  const top = audit.rankingFactors[0];
  return {
    primaryReason: audit.selected.selectionReason,
    evidenceSummary: `Ranked from ${audit.candidateSet.length} candidates across ${audit.stageTrace.length} filter stages.`,
    relevantSkillGap: audit.selected.primaryLearningTarget,
    recentEvidenceCount: audit.rankingFactors.length,
    challengeObjective: audit.selected.primaryLearningTarget,
    difficultyComponents: top ? top.components : null,
    curriculumAlignment: top ? `curriculumFit=${top.components.curriculumFit.toFixed(2)}` : 'n/a',
    selectorVersion: audit.selectorVersion,
    weightsVersion: audit.weightsVersion,
  };
}
