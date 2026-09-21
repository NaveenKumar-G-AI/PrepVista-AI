import { QUESTION_TEMPLATES, QuestionTemplate } from '../data/skillGraph';

export interface GeneratedQuestion {
  templateId: string;
  microSkillId: string;
  strategyLabel: string;
  prompt: string;
  answer: string;
  difficulty: QuestionTemplate['difficulty'];
}

/**
 * Selects a template targeting the exact micro-skill diagnosed (never a random
 * question from the whole topic — Section 23) and renders it with a fresh
 * seed so numbers/context vary between attempts (Section 24).
 */
export function generateTargetedQuestion(
  microSkillId: string,
  difficulty: QuestionTemplate['difficulty'] | 'any',
  seenTemplateIds: string[] = []
): GeneratedQuestion | null {
  const pool = QUESTION_TEMPLATES.filter(
    (t) => t.microSkillId === microSkillId && (difficulty === 'any' || t.difficulty === difficulty)
  );
  if (pool.length === 0) return null;

  const unseen = pool.filter((t) => !seenTemplateIds.includes(t.id));
  const template = (unseen.length > 0 ? unseen : pool)[0];
  const seed = Date.now() % 97; // varies numbers/context on every call
  const rendered = template.render(seed);

  return {
    templateId: template.id,
    microSkillId: template.microSkillId,
    strategyLabel: template.strategyLabel,
    prompt: rendered.prompt,
    answer: rendered.answer,
    difficulty: template.difficulty,
  };
}
