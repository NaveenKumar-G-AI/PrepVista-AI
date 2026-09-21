import { FailureType, InterventionType } from '../types';
import { RETENTION_CONFIG as CFG } from '../config';
import { getQuestionsForSkill, RecoveryQuestion } from './questionBank';

/**
 * Maps a diagnosed failure type to the intervention the spec pairs it
 * with (section 21). Deliberately NOT one generic "revise this topic
 * again" activity for every failure — the whole point of Feature 24 is
 * that the intervention should match the actual gap.
 */
const FAILURE_TO_INTERVENTION: Record<FailureType, InterventionType> = {
  CONCEPT_FAILURE: 'WORKED_EXAMPLE',
  RETRIEVAL_FAILURE: 'ACTIVE_RECALL',
  APPLICATION_FAILURE: 'CONTRAST_QUESTIONS',
  EXECUTION_FAILURE: 'TARGETED_PRACTICE',
  TRANSFER_FAILURE: 'TRANSFER_QUESTION',
  NONE: 'ACTIVE_RECALL',
};

/**
 * Escalation (section 24): repeating the identical intervention after it
 * has already failed to produce lasting improvement is exactly what the
 * spec says not to do. Once a skill has relapsed enough to be flagged
 * `recurringWeakness`, broaden the diagnosis instead of drilling harder
 * on the same narrow hypothesis.
 */
export function selectIntervention(failureType: FailureType, escalationLevel: number): InterventionType {
  const base = FAILURE_TO_INTERVENTION[failureType];
  if (escalationLevel >= CFG.ESCALATION_LEVEL_FOR_RETEACH && base !== 'WORKED_EXAMPLE') {
    return 'WORKED_EXAMPLE';
  }
  if (escalationLevel >= 1 && base === 'ACTIVE_RECALL') {
    return 'TIMED_RETRIEVAL'; // raise the stakes/difficulty of retrieval practice one notch
  }
  return base;
}

export interface RecoveryPlan {
  failureType: FailureType;
  interventionType: InterventionType;
  questions: RecoveryQuestion[];
  contentAuthored: boolean;
}

export function buildRecoveryPlan(skillId: string, failureType: FailureType, escalationLevel: number): RecoveryPlan {
  const interventionType = selectIntervention(failureType, escalationLevel);
  const questions = getQuestionsForSkill(skillId);
  return {
    failureType,
    interventionType,
    questions,
    contentAuthored: questions.length > 0,
  };
}

export function gradeAnswers(
  questions: RecoveryQuestion[],
  answers: { questionId: string; selectedOptionId: string }[],
): { score: number; correctCount: number; total: number; results: { questionId: string; correct: boolean; correctOptionId: string }[] } {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const results = answers.map((a) => {
    const q = byId.get(a.questionId);
    const correctOptionId = q?.correctOptionId ?? '';
    return { questionId: a.questionId, correct: !!q && q.correctOptionId === a.selectedOptionId, correctOptionId };
  });
  const correctCount = results.filter((r) => r.correct).length;
  const total = results.length || 1;
  return { score: correctCount / total, correctCount, total, results };
}
