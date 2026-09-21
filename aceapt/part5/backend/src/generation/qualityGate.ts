import { QuestionHealth, QuestionSource } from "../domain/enums";
import { Question } from "../domain/types";
import { Skill } from "../domain/types";

export interface QualityCheckResult {
  status: QuestionHealth;
  passed: boolean;
  issues: string[];
}

/**
 * §34 — every check here is deterministic and independent of which
 * provider produced the question. A question only ever reaches
 * QuestionRepository/the student pool with status HEALTHY; anything else is
 * persisted (for audit/review) but QuestionRepository.findCandidates()
 * filters strictly on HEALTHY, so it can never be served (§41).
 */
export function runQualityGate(question: Question, knownSkills: Map<string, Skill>): QualityCheckResult {
  const issues: string[] = [];

  // Structural validation
  if (!question.prompt || question.prompt.trim().length < 8) {
    issues.push("Prompt is missing or too short.");
  }
  if (question.options.length !== 4) {
    issues.push(`Expected 4 options, found ${question.options.length}.`);
  }
  const correctOptions = question.options.filter((o) => o.isCorrect);
  if (correctOptions.length !== 1) {
    issues.push(`Expected exactly 1 correct option, found ${correctOptions.length}.`);
  }
  const textSet = new Set(question.options.map((o) => o.text.trim().toLowerCase()));
  if (textSet.size !== question.options.length) {
    issues.push("Two or more options have identical text — answer would be ambiguous.");
  }
  if (question.options.some((o) => !o.text || o.text.trim().length === 0)) {
    issues.push("An option has empty text.");
  }

  // Hint validation
  const hintLevels = question.hints.map((h) => h.level).sort((a, b) => a - b);
  const hasProperProgression = hintLevels.every((lvl, i) => lvl === i + 1);
  if (question.hints.length > 0 && !hasProperProgression) {
    issues.push("Hints are not a clean 1..N progression (gaps or duplicates in levels).");
  }
  if (question.hints.some((h) => !h.text || h.text.trim().length === 0)) {
    issues.push("A hint has empty text.");
  }

  // Explanation validation
  if (!question.explanation.correctReasoning || question.explanation.correctReasoning.trim().length < 10) {
    issues.push("Explanation is missing or too short to be useful.");
  }

  // Skill mapping
  if (!knownSkills.has(question.skillId)) {
    issues.push(`skillId "${question.skillId}" does not match any known skill.`);
  }

  // Difficulty sanity
  const dims: (keyof Question["difficulty"])[] = ["conceptComplexity", "reasoningComplexity", "calculationComplexity", "timePressure", "distractorQuality", "transferDifficulty"];
  for (const dim of dims) {
    const v = question.difficulty[dim] as number;
    if (v < 1 || v > 5 || !Number.isInteger(v)) {
      issues.push(`Difficulty dimension "${dim}" is out of the 1-5 range.`);
    }
  }
  if (question.expectedTimeSeconds < 10 || question.expectedTimeSeconds > 600) {
    issues.push("Expected time looks implausible.");
  }

  // AI-sourced content gets one extra layer: we can't independently re-derive
  // the "true" answer to an open-ended AI-authored word problem the way we
  // can for a formula-backed template, so we deliberately hold it to
  // REVIEW_REQUIRED rather than HEALTHY even when structurally clean, unless
  // a human/editor promotes it later. This is the honest limitation called
  // out in the README rather than pretending full auto-validation (§50).
  if (question.source === QuestionSource.AI_GENERATED && issues.length === 0) {
    return { status: QuestionHealth.REVIEW_REQUIRED, passed: false, issues: ["AI-generated content passed structural checks but requires human answer verification before release."] };
  }

  if (issues.length > 0) {
    return { status: QuestionHealth.ANSWER_ISSUE, passed: false, issues };
  }

  return { status: QuestionHealth.HEALTHY, passed: true, issues: [] };
}
