import { Difficulty, Domain, Question, QuestionHealth, Topic } from '../domain/types';

const VALID_DOMAINS: Domain[] = ['QUANTITATIVE', 'LOGICAL', 'VERBAL'];
const VALID_TOPICS: Topic[] = [
  'ARITHMETIC', 'ALGEBRA', 'DATA_INTERPRETATION',
  'ANALYTICAL_REASONING', 'PATTERNS_SERIES', 'GRAMMAR', 'READING_COMPREHENSION',
];
const VALID_DIFFICULTIES: Difficulty[] = ['EASY', 'MEDIUM', 'MEDIUM_PLUS', 'HARD'];

export interface QualityCheckResult {
  passed: boolean;
  health: QuestionHealth;
  issues: string[];
}

/**
 * Section 47's pipeline made concrete: Specification -> Generation happen
 * upstream (human-authored today; an AI-authoring service could plug in
 * later per section 54). Structural / Answer / Explanation / Difficulty /
 * Skill validation all happen HERE, deterministically. A question that fails
 * any check is never HEALTHY and questionSelectionService will never draw it
 * into an assessment pool (section 48: "Only healthy questions should enter
 * normal assessment pools").
 */
export function runQualityGate(q: Partial<Question>): QualityCheckResult {
  const issues: string[] = [];

  if (!q.id?.trim()) issues.push('missing id');
  if (!q.domain || !VALID_DOMAINS.includes(q.domain)) issues.push(`invalid domain: ${q.domain}`);
  if (!q.topic || !VALID_TOPICS.includes(q.topic)) issues.push(`invalid topic: ${q.topic}`);
  if (!q.skill?.trim()) issues.push('missing skill tag');
  if (!q.difficulty || !VALID_DIFFICULTIES.includes(q.difficulty)) issues.push(`invalid difficulty: ${q.difficulty}`);
  if (!q.prompt?.trim()) issues.push('empty prompt');

  const options = q.options ?? [];
  if (options.length < 4) issues.push(`fewer than 4 options (${options.length})`);

  const optionIds = options.map((o) => o.id);
  if (new Set(optionIds).size !== optionIds.length) issues.push('duplicate option ids');

  const optionTexts = options.map((o) => o.text.trim().toLowerCase());
  if (new Set(optionTexts).size !== optionTexts.length) {
    issues.push('duplicate option text - answer would be ambiguous');
  }
  if (options.some((o) => !o.text?.trim())) issues.push('an option has empty text');

  if (!q.correctOptionId || !optionIds.includes(q.correctOptionId)) {
    issues.push('correctOptionId does not match any option id (answer validation failure)');
  }

  if (!q.explanation?.trim() || q.explanation.trim().length < 10) {
    issues.push('missing or too-short explanation (explanation validation failure)');
  }

  if (!q.expectedTimeSeconds || q.expectedTimeSeconds <= 0 || q.expectedTimeSeconds > 900) {
    issues.push(`implausible expectedTimeSeconds: ${q.expectedTimeSeconds}`);
  }

  const passed = issues.length === 0;
  let health: QuestionHealth = 'HEALTHY';
  if (!passed) {
    if (issues.some((i) => i.includes('correctOptionId') || i.includes('ambiguous'))) health = 'ANSWER_ISSUE';
    else if (issues.some((i) => i.includes('explanation'))) health = 'EXPLANATION_ISSUE';
    else health = 'REVIEW_REQUIRED';
  }

  return { passed, health, issues };
}

/** A question may only be drawn into a real assessment if it is HEALTHY. */
export function isSelectable(q: Question): boolean {
  return q.health === 'HEALTHY';
}
