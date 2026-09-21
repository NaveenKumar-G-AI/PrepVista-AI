import type {
  InterviewBlueprint,
  CandidateEvidenceBundle,
  EvidenceArtifactRef,
  SkillCoverageState,
  SkillImportance,
  QuestionType,
  DifficultyLevel,
} from "../domain/types.js";

export interface TopicCandidate {
  skill: string;
  questionType: QuestionType;
  difficulty: DifficultyLevel;
  evidence?: EvidenceArtifactRef;
}

const IMPORTANCE_WEIGHT: Record<SkillImportance, number> = { CORE: 4, IMPORTANT: 3, SUPPORTING: 2, OPTIONAL: 1 };
const COVERAGE_URGENCY: Record<SkillCoverageState, number> = {
  UNASSESSED: 3,
  PARTIALLY_ASSESSED: 1,
  SUFFICIENTLY_ASSESSED: -Infinity, // never re-select a skill that's already sufficiently covered
};

/**
 * §13 — pick the single highest-value next topic. Returns null when every
 * target skill is either already SUFFICIENTLY_ASSESSED or has already had
 * its one root topic chain in this session (see `alreadyRootedSkills`) —
 * the caller should treat that as "no more new topics", not necessarily
 * "interview complete" (coverageTracker.ts owns the actual stopping decision).
 */
export function selectNextTopic(
  blueprint: InterviewBlueprint,
  perSkillCoverage: Record<string, SkillCoverageState>,
  evidence: CandidateEvidenceBundle,
  recentSkills: string[], // most-recent-first, length capped by caller to diversityWindow
  alreadyRootedSkills: ReadonlySet<string> = new Set()
): TopicCandidate | null {
  let best: { skill: string; score: number; importance: string; hasEvidence: boolean } | null = null;

  for (const req of blueprint.targetSkills) {
    const coverage = perSkillCoverage[req.skill] ?? "UNASSESSED";
    const urgency = COVERAGE_URGENCY[coverage];
    if (urgency === -Infinity) continue;
    // A skill that already has a root topic chain in this session is never
    // re-selected as a brand-new topic — with the same evidence available,
    // a second root question at DEFINITION depth would be indistinguishable
    // from the first (questionValidation.ts's duplicate check would reject
    // it), and re-litigating the same topic from scratch isn't how a real
    // interview works anyway. A skill that still needs more coverage after
    // its chain closes stays at whatever confidence it reached — genuinely
    // incomplete coverage (§29) is reported honestly, not forced.
    if (alreadyRootedSkills.has(req.skill)) continue;

    let score = IMPORTANCE_WEIGHT[req.importance] + urgency;

    const recentIndex = recentSkills.indexOf(req.skill);
    if (recentIndex !== -1) {
      // closer repeats are penalized harder than ones near the edge of the window
      score -= (blueprint.questionStrategy.diversityWindow - recentIndex) * 2;
    }

    const hasEvidence = Boolean(evidence.bySkill[req.skill]?.length);
    if (hasEvidence) score += 1; // §14 — prefer grounding in real candidate evidence when available

    if (!best || score > best.score) {
      best = { skill: req.skill, score, importance: req.importance, hasEvidence };
    }
  }

  if (!best) return null;

  const skillEvidence = evidence.bySkill[best.skill];
  const chosenEvidence = skillEvidence?.[0];
  const questionType = pickQuestionType(blueprint, best.skill, chosenEvidence);
  const difficulty = blueprint.difficulty === "ADAPTIVE" ? "MEDIUM" : blueprint.difficulty;

  return { skill: best.skill, questionType, difficulty, evidence: chosenEvidence };
}

function pickQuestionType(
  blueprint: InterviewBlueprint,
  _skill: string,
  evidence: EvidenceArtifactRef | undefined
): QuestionType {
  // Mode-driven defaults (§15/§19/§20/§24/§25) take priority when the mode
  // implies a specific question shape.
  switch (blueprint.mode) {
    case "DEBUGGING_INTERVIEW":
      return "DEBUGGING";
    case "ARCHITECTURE_INTERVIEW":
      return "ARCHITECTURE";
    case "SCENARIO_INTERVIEW":
      return "SCENARIO";
    case "GAP_VERIFICATION":
      return "VERIFICATION";
    case "PROJECT_DEFENSE":
      return evidence?.sourceType === "PROJECT_SUBMISSION" ? "PROJECT_BASED" : "CONCEPTUAL";
    case "CODE_DEFENSE":
      return evidence?.sourceType === "CODING_SUBMISSION" ? "CODE_BASED" : "CONCEPTUAL";
    default:
      break;
  }
  // Otherwise: ground in whatever evidence exists, else fall back to conceptual.
  if (evidence?.sourceType === "PROJECT_SUBMISSION") return "PROJECT_BASED";
  if (evidence?.sourceType === "CODING_SUBMISSION") return "CODE_BASED";
  if (evidence?.sourceType === "DEBUGGING_EVIDENCE") return "DEBUGGING";
  return "CONCEPTUAL";
}
