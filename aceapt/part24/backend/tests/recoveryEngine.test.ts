import { describe, it, expect } from 'vitest';
import { selectIntervention, buildRecoveryPlan, gradeAnswers } from '../src/engine/recoveryEngine';
import { getQuestionsForSkill } from '../src/engine/questionBank';

describe('selectIntervention', () => {
  it('maps each failure type to a distinct, non-generic intervention at escalation 0', () => {
    expect(selectIntervention('CONCEPT_FAILURE', 0)).toBe('WORKED_EXAMPLE');
    expect(selectIntervention('RETRIEVAL_FAILURE', 0)).toBe('ACTIVE_RECALL');
    expect(selectIntervention('APPLICATION_FAILURE', 0)).toBe('CONTRAST_QUESTIONS');
    expect(selectIntervention('EXECUTION_FAILURE', 0)).toBe('TARGETED_PRACTICE');
    expect(selectIntervention('TRANSFER_FAILURE', 0)).toBe('TRANSFER_QUESTION');
  });

  it('does not repeat the identical intervention once escalation is high — broadens to re-teaching', () => {
    const first = selectIntervention('RETRIEVAL_FAILURE', 0);
    const escalated = selectIntervention('RETRIEVAL_FAILURE', 2);
    expect(first).not.toBe(escalated);
    expect(escalated).toBe('WORKED_EXAMPLE');
  });

  it('raises retrieval practice difficulty at escalation 1 before fully re-teaching', () => {
    expect(selectIntervention('RETRIEVAL_FAILURE', 1)).toBe('TIMED_RETRIEVAL');
  });
});

describe('buildRecoveryPlan', () => {
  it('flags when a skill has no authored recovery content instead of inventing questions', () => {
    const plan = buildRecoveryPlan('some_unauthored_skill', 'RETRIEVAL_FAILURE', 0);
    expect(plan.contentAuthored).toBe(false);
    expect(plan.questions).toHaveLength(0);
  });

  it('returns real, gradeable questions for an authored skill', () => {
    const plan = buildRecoveryPlan('time_and_work', 'RETRIEVAL_FAILURE', 0);
    expect(plan.contentAuthored).toBe(true);
    expect(plan.questions.length).toBeGreaterThan(0);
  });
});

describe('gradeAnswers', () => {
  it('grades correctly against the answer key without exposing it beforehand', () => {
    const questions = getQuestionsForSkill('time_and_work');
    const allCorrect = questions.map((q) => ({ questionId: q.id, selectedOptionId: q.correctOptionId }));
    const graded = gradeAnswers(questions, allCorrect);
    expect(graded.score).toBe(1);
    expect(graded.correctCount).toBe(questions.length);
  });

  it('computes a partial score when some answers are wrong', () => {
    const questions = getQuestionsForSkill('probability');
    const answers = questions.map((q, i) => ({
      questionId: q.id,
      selectedOptionId: i === 0 ? q.options.find((o) => o.id !== q.correctOptionId)!.id : q.correctOptionId,
    }));
    const graded = gradeAnswers(questions, answers);
    expect(graded.correctCount).toBe(questions.length - 1);
    expect(graded.score).toBeLessThan(1);
  });
});
