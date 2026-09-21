// ============================================================================
// Phase 22-23 — "Track explicitly: required skills, skills assessed,
// skills sufficiently assessed, skills partially assessed, skills still
// uncertain, skills not assessed. Never claim complete technical assessment
// if the required evidence does not exist."
// ============================================================================

import type {
  BlueprintSkillTarget,
  CompletionRequirements,
  EvidenceState,
  SessionCoverage,
  SkillCoverageEntry,
  SkillEvidence,
  SkillId,
} from "../domain/types.js";

/** Recomputes one skill's coverage entry after a new evaluation/evidence update. */
export function updateSkillCoverage(
  target: BlueprintSkillTarget,
  previous: SkillCoverageEntry | undefined,
  questionsAskedDelta: number,
  followUpDepthDelta: number,
  latestEvidenceState: EvidenceState,
  latestConfidence: number,
): SkillCoverageEntry {
  const questionsAsked = (previous?.questionsAsked ?? 0) + questionsAskedDelta;
  const followUpDepth = (previous?.followUpDepth ?? 0) + followUpDepthDelta;

  return {
    skillId: target.skillId,
    importance: target.importance,
    questionsAsked,
    followUpDepth,
    currentEvidenceState: latestEvidenceState,
    currentConfidence: latestConfidence,
    status: deriveStatus(target, questionsAsked, latestEvidenceState, latestConfidence),
  };
}

function deriveStatus(
  target: BlueprintSkillTarget,
  questionsAsked: number,
  evidenceState: EvidenceState,
  confidence: number,
): SkillCoverageEntry["status"] {
  if (questionsAsked === 0) return "NOT_ASSESSED";

  const metMinimum = questionsAsked >= target.minQuestions;
  if (evidenceState === "VERIFIED" && confidence >= 0.6 && metMinimum) return "SUFFICIENT";
  if (evidenceState === "PARTIALLY_VERIFIED" || (evidenceState === "VERIFIED" && !metMinimum)) return "PARTIAL";
  if (evidenceState === "UNCERTAIN") return "UNCERTAIN";
  return "PARTIAL";
}

export interface CoverageReport {
  requiredSkillIds: SkillId[];
  sufficientSkillIds: SkillId[];
  partialSkillIds: SkillId[];
  uncertainSkillIds: SkillId[];
  notAssessedSkillIds: SkillId[];
}

export function buildCoverageReport(skills: BlueprintSkillTarget[], coverage: SessionCoverage): CoverageReport {
  const report: CoverageReport = {
    requiredSkillIds: skills.map((s) => s.skillId),
    sufficientSkillIds: [],
    partialSkillIds: [],
    uncertainSkillIds: [],
    notAssessedSkillIds: [],
  };

  for (const target of skills) {
    const entry = coverage[target.skillId];
    const status = entry?.status ?? "NOT_ASSESSED";
    switch (status) {
      case "SUFFICIENT":
        report.sufficientSkillIds.push(target.skillId);
        break;
      case "PARTIAL":
        report.partialSkillIds.push(target.skillId);
        break;
      case "UNCERTAIN":
        report.uncertainSkillIds.push(target.skillId);
        break;
      default:
        report.notAssessedSkillIds.push(target.skillId);
    }
  }
  return report;
}

export interface CompletionCheck {
  isComplete: boolean;
  reason: string;
}

/**
 * Phase 23: "Never claim complete technical assessment if the required
 * evidence does not exist" — so completion requires BOTH the question-count
 * floor AND the skill-sufficiency bar from the blueprint, and it's a hard
 * boolean with a stated reason, never inferred silently.
 */
export function checkCompletion(
  skills: BlueprintSkillTarget[],
  coverage: SessionCoverage,
  requirements: CompletionRequirements,
  totalQuestionsAsked: number,
): CompletionCheck {
  if (totalQuestionsAsked < requirements.minQuestionsTotal) {
    return { isComplete: false, reason: `Only ${totalQuestionsAsked}/${requirements.minQuestionsTotal} minimum questions asked.` };
  }
  if (totalQuestionsAsked >= requirements.maxQuestionsTotal) {
    return { isComplete: true, reason: `Reached the maximum question budget (${requirements.maxQuestionsTotal}).` };
  }

  const report = buildCoverageReport(skills, coverage);

  if (requirements.minSkillsSufficientlyAssessed === "ALL_CORE") {
    const coreSkillIds = skills.filter((s) => s.importance === "CORE").map((s) => s.skillId);
    const allCoreSufficient = coreSkillIds.every((id) => report.sufficientSkillIds.includes(id));
    if (!allCoreSufficient) {
      const remaining = coreSkillIds.filter((id) => !report.sufficientSkillIds.includes(id));
      return { isComplete: false, reason: `Core skills not yet sufficiently assessed: ${remaining.join(", ")}.` };
    }
    return { isComplete: true, reason: "All core skills sufficiently assessed and minimum question count met." };
  }

  if (report.sufficientSkillIds.length < requirements.minSkillsSufficientlyAssessed) {
    return {
      isComplete: false,
      reason: `${report.sufficientSkillIds.length}/${requirements.minSkillsSufficientlyAssessed} required skills sufficiently assessed.`,
    };
  }
  return { isComplete: true, reason: "Minimum sufficiently-assessed skill count and question count met." };
}

/** Used by evidence extraction (Phase 44) to roll multiple evaluations for one skill into a single EvidenceState. */
export function aggregateEvidenceState(existing: SkillEvidence[]): EvidenceState {
  if (existing.length === 0) return "UNASSESSED";
  const latest = existing[existing.length - 1];
  return latest ? latest.evidenceState : "UNASSESSED";
}
