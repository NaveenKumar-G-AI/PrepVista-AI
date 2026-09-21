import { GapStatus, GapTrend, type StructuredExplanation } from "./types.js";

/**
 * Implements Phase 32 (Gap Explanation). Every sentence here is assembled
 * directly from already-computed structured fields - nothing is invented.
 * This is what the product shows if the AI explanation layer (Phase 33) is
 * unavailable (Phase 34/75), and it is also the grounding context handed
 * to the AI layer when it IS available, so the AI has no room to state
 * anything this function didn't already establish.
 */
export function buildStructuredExplanation(params: {
  skillName: string;
  roleName: string;
  gapStatus: GapStatus;
  currentLabel: string;
  targetLabel: string;
  trend: GapTrend;
  evidenceCount: number;
}): StructuredExplanation {
  const { skillName, roleName, gapStatus, currentLabel, targetLabel, trend, evidenceCount } = params;

  const roleRequirement = `The ${roleName} role requires ${targetLabel}-level capability in ${skillName}.`;
  const demonstratedCapability =
    gapStatus === GapStatus.UNASSESSED
      ? `No meaningful evidence has been recorded for ${skillName} yet.`
      : `Verified performance currently indicates ${currentLabel}-level capability.`;
  const evidenceNote =
    evidenceCount === 0
      ? "No evidence is available to assess this skill."
      : `Based on ${evidenceCount} piece${evidenceCount === 1 ? "" : "s"} of verified evidence.`;

  let trendNote: string | undefined;
  if (trend === GapTrend.IMPROVING) {
    trendNote = "Recent evidence shows improvement, though the required level has not yet been consistently demonstrated.";
  } else if (trend === GapTrend.WORSENING) {
    trendNote = "Recent evidence shows a decline compared to earlier performance.";
  } else if (trend === GapTrend.VOLATILE) {
    trendNote = "Recent performance has been inconsistent, which lowers confidence in this result.";
  }

  let summarySentence: string;
  switch (gapStatus) {
    case GapStatus.NO_GAP:
      summarySentence = `${skillName} currently meets the target level for the ${roleName} role.`;
      break;
    case GapStatus.PARTIAL:
      summarySentence = `${skillName} is close to the target level for the ${roleName} role, with a small remaining gap.`;
      break;
    case GapStatus.BELOW_TARGET:
      summarySentence = `${skillName} is below the target level for the ${roleName} role.`;
      break;
    case GapStatus.UNASSESSED:
      summarySentence = `${skillName} has not yet been assessed for the ${roleName} role.`;
      break;
    case GapStatus.INSUFFICIENT_EVIDENCE:
      summarySentence = `There is not yet enough evidence to confidently place ${skillName} relative to the ${roleName} role's requirement.`;
      break;
    case GapStatus.INCONSISTENT:
      summarySentence = `${skillName} performance has been too inconsistent to confidently assess against the ${roleName} role's requirement.`;
      break;
    case GapStatus.DEPENDENCY_BLOCKED:
      summarySentence = `${skillName} is below target for the ${roleName} role, and is affected by a gap in a foundational prerequisite skill.`;
      break;
  }

  return { summarySentence, roleRequirement, demonstratedCapability, evidenceNote, trendNote };
}
