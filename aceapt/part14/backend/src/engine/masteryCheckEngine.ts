/**
 * Sections 22-24: a mastery check is a deliberately-composed probe, not
 * "another quiz". generateBlueprint() derives a target composition from
 * what's actually in the skill's question bank (never invents a count it
 * can't fulfil); selectQuestions() then greedily prioritises novel/varied
 * coverage first, since that's the evidence the engine most needs and
 * practice sessions are least likely to have already produced.
 */

import { DIFFICULTY_ORDER, DifficultyLevel, MasteryCheckBlueprint, Question, QuestionFormat, Skill } from '../domain/types';

export function generateBlueprint(skillId: string, skills: Skill[], allQuestions: Question[]): MasteryCheckBlueprint {
  const skill = skills.find((s) => s.id === skillId);
  if (!skill) throw new Error(`Unknown skill: ${skillId}`);

  const pool = allQuestions.filter((q) => q.skillId === skillId);
  const availableDifficulties = DIFFICULTY_ORDER.filter((d) => pool.some((q) => q.difficulty === d));
  const availableFormats = Array.from(new Set(pool.map((q) => q.format))) as QuestionFormat[];
  const novelCount = pool.filter((q) => q.novelty === 'novel' || q.novelty === 'varied').length;

  return {
    targetSkillId: skillId,
    questionCount: Math.min(6, pool.length),
    difficulties: availableDifficulties,
    formats: availableFormats.slice(0, 4),
    novelApplicationCount: Math.min(3, novelCount),
    purpose: `Verify independent application of ${skill.name} beyond familiar practice \u2014 not just whether ${skill.name.toLowerCase()} questions can be answered, but whether the underlying method survives unfamiliar difficulty, format and context.`,
  };
}

export function selectQuestions(blueprint: MasteryCheckBlueprint, allQuestions: Question[], previouslyUsedIds: Set<string>): Question[] {
  const pool = allQuestions.filter((q) => q.skillId === blueprint.targetSkillId);
  const selected: Question[] = [];

  const takeFrom = (candidates: Question[], count: number) => {
    if (count <= 0) return;
    const unused = candidates.filter((q) => !previouslyUsedIds.has(q.id) && !selected.some((s) => s.id === q.id));
    const used = candidates.filter((q) => previouslyUsedIds.has(q.id) && !selected.some((s) => s.id === q.id));
    const ordered = [...unused, ...used]; // prefer fresh questions, fall back to repeats only if the bank is small
    selected.push(...ordered.slice(0, count));
  };

  const novelPool = pool.filter((q) => q.novelty === 'novel' || q.novelty === 'varied');
  const familiarPool = pool.filter((q) => q.novelty === 'seen' || q.novelty === 'similar');

  takeFrom(novelPool, blueprint.novelApplicationCount);
  takeFrom(familiarPool, blueprint.questionCount - selected.length);

  if (selected.length < blueprint.questionCount) {
    takeFrom(pool, blueprint.questionCount - selected.length);
  }

  return selected.slice(0, blueprint.questionCount);
}
