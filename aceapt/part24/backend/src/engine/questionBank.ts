import { QuestionType } from '../types';

/**
 * This is demo content only, for the vertical-slice prototype. In a real
 * ACEAPT integration, recovery questions should be pulled from the
 * existing question bank (spec section 12: "reuse existing question
 * bank... do not invent data") rather than authored here. Every question
 * below has been checked by hand for correctness — see comments.
 */
export interface RecoveryQuestion {
  id: string;
  skillId: string;
  stepRole: 'recall' | 'apply' | 'vary' | 'verify';
  stepTitle: string;
  prompt: string;
  options: { id: string; text: string }[];
  correctOptionId: string;
  questionType: QuestionType;
}

export const QUESTION_BANK: Record<string, RecoveryQuestion[]> = {
  time_and_work: [
    {
      id: 'tw_q1',
      skillId: 'time_and_work',
      stepRole: 'recall',
      stepTitle: 'Recall the method',
      prompt: "Two people are going to work on a task together. What must you find for each person before combining their work?",
      options: [
        { id: 'a', text: 'Their individual time taken' },
        { id: 'b', text: 'Their individual work rate (work done per unit time)' },
        { id: 'c', text: 'The total work only' },
        { id: 'd', text: 'Nothing — just add the two times' },
      ],
      correctOptionId: 'b',
      questionType: 'recall',
    },
    {
      id: 'tw_q2',
      skillId: 'time_and_work',
      stepRole: 'apply',
      stepTitle: 'Apply it',
      // 1/20 + 1/30 = 3/60 + 2/60 = 5/60 = 1/12 -> 12 minutes
      prompt: 'Two pipes can fill a tank in 20 minutes and 30 minutes respectively. Working together, how long will they take?',
      options: [
        { id: 'a', text: '12 minutes' },
        { id: 'b', text: '25 minutes' },
        { id: 'c', text: '50 minutes' },
        { id: 'd', text: '10 minutes' },
      ],
      correctOptionId: 'a',
      questionType: 'application',
    },
    {
      id: 'tw_q3',
      skillId: 'time_and_work',
      stepRole: 'vary',
      stepTitle: 'Solve a new variation',
      // A rate = 2x B rate = 2*(1/24) = 1/12. Combined = 1/12+1/24 = 3/24 = 1/8 -> 8 days
      prompt: 'A works twice as fast as B. B alone takes 24 days to finish a task. Working together, how many days will they take?',
      options: [
        { id: 'a', text: '12 days' },
        { id: 'b', text: '8 days' },
        { id: 'c', text: '16 days' },
        { id: 'd', text: '4 days' },
      ],
      correctOptionId: 'b',
      questionType: 'transfer',
    },
    {
      id: 'tw_q4',
      skillId: 'time_and_work',
      stepRole: 'verify',
      stepTitle: 'Verify',
      // 12 workers * 8 days = 96 worker-days. 96 / 8 workers = 12 days
      prompt: '12 workers finish a job in 8 days. How many days would 8 workers take for the same job, at the same rate per worker?',
      options: [
        { id: 'a', text: '8 days' },
        { id: 'b', text: '5.3 days' },
        { id: 'c', text: '12 days' },
        { id: 'd', text: '18 days' },
      ],
      correctOptionId: 'c',
      questionType: 'application',
    },
  ],

  probability: [
    {
      id: 'pr_q1',
      skillId: 'probability',
      stepRole: 'recall',
      stepTitle: 'Recall the method',
      prompt: 'A bag has 4 red balls and 6 blue balls. What is the probability of drawing a red ball?',
      // 4/10 = 2/5
      options: [
        { id: 'a', text: '4/6' },
        { id: 'b', text: '2/5' },
        { id: 'c', text: '1/4' },
        { id: 'd', text: '6/10' },
      ],
      correctOptionId: 'b',
      questionType: 'recall',
    },
    {
      id: 'pr_q2',
      skillId: 'probability',
      stepRole: 'apply',
      stepTitle: 'Apply it',
      // HH, HT, TH, TT -> at least one head = 3/4
      prompt: 'Two fair coins are tossed. What is the probability of getting at least one head?',
      options: [
        { id: 'a', text: '1/2' },
        { id: 'b', text: '1/4' },
        { id: 'c', text: '3/4' },
        { id: 'd', text: '1' },
      ],
      correctOptionId: 'c',
      questionType: 'application',
    },
    {
      id: 'pr_q3',
      skillId: 'probability',
      stepRole: 'vary',
      stepTitle: 'Solve a new variation',
      // numbers > 4 on a die: {5,6} -> 2/6 = 1/3
      prompt: 'A fair die is rolled once. What is the probability of getting a number greater than 4?',
      options: [
        { id: 'a', text: '1/3' },
        { id: 'b', text: '1/2' },
        { id: 'c', text: '1/6' },
        { id: 'd', text: '2/3' },
      ],
      correctOptionId: 'a',
      questionType: 'transfer',
    },
  ],

  permutation_combination: [
    {
      id: 'pc_q1',
      skillId: 'permutation_combination',
      stepRole: 'verify',
      stepTitle: 'Quick check',
      // 5P2 = 5*4 = 20
      prompt: 'In how many ways can 1st and 2nd place be awarded among 5 runners?',
      options: [
        { id: 'a', text: '10' },
        { id: 'b', text: '20' },
        { id: 'c', text: '25' },
        { id: 'd', text: '5' },
      ],
      correctOptionId: 'b',
      questionType: 'recall',
    },
    {
      id: 'pc_q2',
      skillId: 'permutation_combination',
      stepRole: 'verify',
      stepTitle: 'Quick check',
      // 4! = 24
      prompt: 'In how many ways can 4 different books be arranged on a shelf?',
      options: [
        { id: 'a', text: '16' },
        { id: 'b', text: '12' },
        { id: 'c', text: '24' },
        { id: 'd', text: '4' },
      ],
      correctOptionId: 'c',
      questionType: 'recall',
    },
  ],
};

export function getQuestionsForSkill(skillId: string): RecoveryQuestion[] {
  return QUESTION_BANK[skillId] ?? [];
}

export function getQuestionsById(ids: string[]): RecoveryQuestion[] {
  const all = Object.values(QUESTION_BANK).flat();
  const map = new Map(all.map((q) => [q.id, q]));
  return ids.map((id) => map.get(id)).filter((q): q is RecoveryQuestion => !!q);
}

/** Never send correct answers to the client before grading. */
export function toPublicQuestion(q: RecoveryQuestion) {
  return {
    id: q.id,
    skillId: q.skillId,
    stepRole: q.stepRole,
    stepTitle: q.stepTitle,
    prompt: q.prompt,
    options: q.options,
  };
}
