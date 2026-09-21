import type {
  ConfidenceBand,
  InterviewBlueprint,
  InterviewCoverageReport,
  SkillCoverageState,
  SkillImportance,
} from "../domain/types.js";

const BAND_RANK: Record<ConfidenceBand, number> = { LOW: 0, MODERATE: 1, HIGH: 2 };

export interface SkillProgress {
  questionsAsked: number;
  highestConfidence: ConfidenceBand | null;
}

export function meetsThreshold(band: ConfidenceBand | null, threshold: ConfidenceBand): boolean {
  if (!band) return false;
  return BAND_RANK[band] >= BAND_RANK[threshold];
}

/** §28 — per-skill coverage state, derived only from what was actually observed for that skill. */
export function computeSkillCoverage(
  progress: SkillProgress,
  importance: SkillImportance,
  blueprint: InterviewBlueprint
): SkillCoverageState {
  if (progress.questionsAsked === 0) return "UNASSESSED";

  const minQuestions = importance === "CORE" ? blueprint.coverageRules.minQuestionsPerCoreSkill : 1;
  const enoughQuestions = progress.questionsAsked >= minQuestions;
  const confidentEnough = meetsThreshold(progress.highestConfidence, blueprint.coverageRules.sufficientEvidenceThreshold);

  if (enoughQuestions && confidentEnough) return "SUFFICIENTLY_ASSESSED";
  return "PARTIALLY_ASSESSED";
}

/**
 * §29 — the report tells the truth about coverage independent of *why* the
 * interview stopped. Hitting a question/time limit with skills still
 * unassessed must show up here as incomplete, never silently upgraded.
 */
export function buildCoverageReport(
  blueprint: InterviewBlueprint,
  perSkillProgress: Record<string, SkillProgress>
): InterviewCoverageReport {
  const requiredSkills = blueprint.targetSkills.map((s) => s.skill);
  const perSkill: Record<string, SkillCoverageState> = {};

  for (const req of blueprint.targetSkills) {
    const progress = perSkillProgress[req.skill] ?? { questionsAsked: 0, highestConfidence: null };
    perSkill[req.skill] = computeSkillCoverage(progress, req.importance, blueprint);
  }

  const sufficientlyAssessed = requiredSkills.filter((s) => perSkill[s] === "SUFFICIENTLY_ASSESSED");
  const partiallyAssessed = requiredSkills.filter((s) => perSkill[s] === "PARTIALLY_ASSESSED");
  const unassessed = requiredSkills.filter((s) => perSkill[s] === "UNASSESSED");

  return {
    requiredSkills,
    perSkill,
    sufficientlyAssessed,
    partiallyAssessed,
    unassessed,
    isComplete: sufficientlyAssessed.length === requiredSkills.length,
  };
}

export interface StoppingDecision {
  shouldStop: boolean;
  reason: "COVERAGE_COMPLETE" | "MAX_QUESTIONS_REACHED" | "MAX_DURATION_REACHED" | "CONTINUE";
}

/** §28 adaptive stopping. Time/question limits are legitimate stop reasons on their own — they just don't make buildCoverageReport() claim completeness it didn't earn. */
export function decideStop(
  blueprint: InterviewBlueprint,
  coverage: InterviewCoverageReport,
  questionsAskedTotal: number,
  elapsedMinutes: number
): StoppingDecision {
  if (coverage.isComplete) return { shouldStop: true, reason: "COVERAGE_COMPLETE" };
  if (questionsAskedTotal >= blueprint.timeConfig.maxQuestions) {
    return { shouldStop: true, reason: "MAX_QUESTIONS_REACHED" };
  }
  if (elapsedMinutes >= blueprint.timeConfig.maxDurationMinutes) {
    return { shouldStop: true, reason: "MAX_DURATION_REACHED" };
  }
  return { shouldStop: false, reason: "CONTINUE" };
}
