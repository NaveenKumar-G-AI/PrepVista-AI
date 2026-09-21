import { Question, SimulationBlueprint, SimulationQuestionRef, SkillId } from '../domain/types';
import {
  getQuestionById,
  getQuestionsBySkill,
  getQuestionsBySkillAndDifficulty,
  QUESTION_BANK,
} from '../data/questionBank';
import { shuffle } from '../util/math';

// ============================================================
// QUESTION SELECTION SERVICE  (spec sections 7, 8, 9, 10, 42)
// ============================================================
// "Unpredictable but fair": difficulty follows the blueprint's fixed
// sequence exactly (no random spikes - section 10); skill order is
// shuffled and then smoothed so the same skill rarely repeats
// back-to-back (section 9's worked example), while preferring
// questions this student has been exposed to least (section 42).
// This is deliberately a plain, auditable algorithm rather than a
// black box - spec section 46 keeps question sequencing in the
// deterministic core, with only novelty/exposure informed by data.

export class QuestionSelectionService {
  selectQuestions(blueprint: SimulationBlueprint, exposure: Record<string, number>): SimulationQuestionRef[] {
    const skillSequence = buildSkillSequence(blueprint);
    const used = new Set<string>();
    const refs: SimulationQuestionRef[] = [];

    for (let i = 0; i < blueprint.questionCount; i++) {
      const skill = skillSequence[i];
      const difficulty = blueprint.difficultySequence[i] ?? 'medium';

      const chosen = pickQuestion(skill, difficulty, used, exposure);
      used.add(chosen.id);
      refs.push({
        questionId: chosen.id,
        sequence: i,
        skill: chosen.skill,
        difficulty: chosen.difficulty,
      });
    }

    return refs;
  }
}

function buildSkillSequence(blueprint: SimulationBlueprint): SkillId[] {
  const bag: SkillId[] = [];
  for (const entry of blueprint.skillDistribution) {
    for (let i = 0; i < entry.count; i++) bag.push(entry.skill);
  }
  // Pad defensively if distribution counts fall short of questionCount.
  let padIdx = 0;
  while (bag.length < blueprint.questionCount) {
    bag.push(blueprint.skillDistribution[padIdx % blueprint.skillDistribution.length].skill);
    padIdx++;
  }
  shuffle(bag);
  smoothAdjacentDuplicates(bag);
  return bag.slice(0, blueprint.questionCount);
}

/** Best-effort pass to avoid the same skill appearing twice in a row. */
function smoothAdjacentDuplicates(bag: SkillId[]): void {
  for (let i = 1; i < bag.length; i++) {
    if (bag[i] === bag[i - 1]) {
      const swapWith = bag.findIndex((s, j) => j > i && s !== bag[i] && s !== bag[i - 1]);
      if (swapWith !== -1) {
        [bag[i], bag[swapWith]] = [bag[swapWith], bag[i]];
      }
    }
  }
}

function pickQuestion(
  skill: SkillId,
  difficulty: 'easy' | 'medium' | 'hard',
  used: Set<string>,
  exposure: Record<string, number>,
): Question {
  const exact = getQuestionsBySkillAndDifficulty(skill, difficulty).filter((q) => !used.has(q.id));
  if (exact.length > 0) return pickLeastExposed(exact, exposure);

  const sameSkill = getQuestionsBySkill(skill).filter((q) => !used.has(q.id));
  if (sameSkill.length > 0) return pickLeastExposed(sameSkill, exposure);

  // Last resort: pick anything unused so the simulation can still start.
  // In production this branch means the real question bank is too thin
  // for the configured blueprint and should raise an alert.
  const anyUnused = QUESTION_BANK.filter((q) => !used.has(q.id));
  return pickLeastExposed(anyUnused.length > 0 ? anyUnused : QUESTION_BANK, exposure);
}

function pickLeastExposed(candidates: Question[], exposure: Record<string, number>): Question {
  const minExposure = Math.min(...candidates.map((q) => exposure[q.id] ?? 0));
  const tier = candidates.filter((q) => (exposure[q.id] ?? 0) === minExposure);
  return tier[Math.floor(Math.random() * tier.length)];
}

export function toPublicQuestion(question: Question, sequence: number, hideTopicLabels: boolean) {
  return {
    id: question.id,
    sequence,
    skill: hideTopicLabels ? null : question.skill,
    difficulty: hideTopicLabels ? null : question.difficulty,
    prompt: question.prompt,
    options: question.options,
  };
}

export { getQuestionById };
