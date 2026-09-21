import type { GeneratedQuestionCandidate } from "./ai/types.js";
import type { NoveltyLevel } from "../types/index.js";
import { jaccardSimilarity, DUPLICATE_SIMILARITY_THRESHOLD } from "../utils/similarity.js";

export interface QualityCheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

export interface QualityPipelineResult {
  approved: boolean;
  checks: QualityCheckResult[];
}

/**
 * Spec section 47: SPECIFICATION -> GENERATION -> ANSWER VALIDATION ->
 * SKILL VALIDATION -> DIFFICULTY VALIDATION -> AMBIGUITY CHECK ->
 * EXPLANATION VALIDATION -> DUPLICATE/EXPOSURE CHECK -> QUALITY GATE.
 * If any check fails, the question is REJECTED and never stored as
 * APPROVED - questionVariationService then either retries generation or
 * falls back to the seed pool, but this function itself never softens a
 * failure into a pass.
 *
 * SKILL and DIFFICULTY validation are necessarily approximate for a
 * prototype: they compare the model's own self-reported skill tag and
 * difficulty against what was requested (spec section 45 permits AI to
 * self-report; it never lets AI self-certify correctness or grading, which
 * stays fully deterministic in ANSWER VALIDATION and everywhere a student's
 * response is scored).
 */
export function runQuestionQualityPipeline(
  candidate: GeneratedQuestionCandidate,
  params: { expectedSkillKey: string; requestedNovelty: NoveltyLevel; requestedDifficulty: number; existingPrompts: string[] }
): QualityPipelineResult {
  const checks: QualityCheckResult[] = [];

  // SPECIFICATION - the shape we asked for is the shape that came back.
  checks.push({
    name: "specification",
    passed: Boolean(candidate.prompt && candidate.choices && candidate.correctChoiceId && candidate.explanation),
    detail: "All required fields present.",
  });

  // GENERATION - already implicitly passed if we have a candidate at all
  // (AIGenerationUnavailableError would have been thrown otherwise), but we
  // still check for degenerate output (empty/too-short prompt).
  checks.push({
    name: "generation",
    passed: candidate.prompt.trim().length >= 15,
    detail: candidate.prompt.trim().length >= 15 ? "Prompt has substantive content." : "Prompt is too short to be a real question.",
  });

  // ANSWER VALIDATION - deterministic. The correct choice id must exist
  // among the choices, and there must be exactly one match.
  const matchingChoices = candidate.choices.filter((c) => c.id === candidate.correctChoiceId);
  checks.push({
    name: "answer_validation",
    passed: matchingChoices.length === 1,
    detail: matchingChoices.length === 1 ? "correct_choice_id matches exactly one choice." : `correct_choice_id matched ${matchingChoices.length} choices.`,
  });

  // SKILL VALIDATION - approximate: the model's self-reported tag should at
  // least share a token with the requested skill key (cheap heuristic; a
  // human reviewer or a stronger secondary classifier would replace this in
  // a full production build - flagged, not hidden).
  const tagTokens = new Set(candidate.reportedSkillTag.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter(Boolean));
  const keyTokens = new Set(params.expectedSkillKey.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(" ").filter(Boolean));
  const sharesToken = [...tagTokens].some((t) => keyTokens.has(t));
  checks.push({
    name: "skill_validation",
    passed: sharesToken,
    detail: sharesToken
      ? `Reported skill tag "${candidate.reportedSkillTag}" aligns with requested skill "${params.expectedSkillKey}".`
      : `Reported skill tag "${candidate.reportedSkillTag}" does not obviously match requested skill "${params.expectedSkillKey}".`,
  });

  // DIFFICULTY VALIDATION - self-reported difficulty within tolerance of target.
  const difficultyDelta = Math.abs(candidate.reportedDifficulty - params.requestedDifficulty);
  checks.push({
    name: "difficulty_validation",
    passed: difficultyDelta <= 0.35,
    detail: `Requested ${params.requestedDifficulty}, reported ${candidate.reportedDifficulty} (delta ${difficultyDelta.toFixed(2)}).`,
  });

  // AMBIGUITY CHECK - deterministic: exactly 4 choices, no duplicate choice
  // text, exactly one correct answer (already checked above), non-empty texts.
  const choiceTexts = candidate.choices.map((c) => c.text.trim().toLowerCase());
  const uniqueChoiceTexts = new Set(choiceTexts);
  const noEmptyChoices = candidate.choices.every((c) => c.text.trim().length > 0);
  const ambiguityOk = candidate.choices.length === 4 && uniqueChoiceTexts.size === candidate.choices.length && noEmptyChoices;
  checks.push({
    name: "ambiguity_check",
    passed: ambiguityOk,
    detail: ambiguityOk ? "4 distinct, non-empty choices." : "Duplicate, empty, or wrong number of choices.",
  });

  // EXPLANATION VALIDATION
  const explanationOk = candidate.explanation.trim().length >= 10;
  checks.push({
    name: "explanation_validation",
    passed: explanationOk,
    detail: explanationOk ? "Explanation present and substantive." : "Explanation missing or too short.",
  });

  // DUPLICATE / EXPOSURE CHECK - near-duplicate of an already-approved prompt for this skill.
  let mostSimilar = 0;
  for (const existing of params.existingPrompts) {
    mostSimilar = Math.max(mostSimilar, jaccardSimilarity(candidate.prompt, existing));
  }
  const notDuplicate = mostSimilar < DUPLICATE_SIMILARITY_THRESHOLD;
  checks.push({
    name: "duplicate_check",
    passed: notDuplicate,
    detail: notDuplicate ? `Highest similarity to an existing question: ${mostSimilar.toFixed(2)}.` : `Too similar to an existing question (similarity ${mostSimilar.toFixed(2)}).`,
  });

  return { approved: checks.every((c) => c.passed), checks };
}
