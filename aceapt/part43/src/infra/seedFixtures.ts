import { Question, Skill } from '../domain/types';

export const SKILLS: Skill[] = [
  { id: 'quant.arithmetic.percentage', domain: 'Quant', topic: 'Arithmetic', subtopic: 'Percentage', label: 'Percentage', placementRelevance: 0.8 },
  { id: 'quant.arithmetic.ratio', domain: 'Quant', topic: 'Arithmetic', subtopic: 'Ratio', label: 'Ratio', placementRelevance: 0.7 },
  {
    id: 'quant.arithmetic.percentage_ratio_mixed',
    domain: 'Quant',
    topic: 'Arithmetic',
    subtopic: 'Percentage + Ratio',
    label: 'Mixed Percentage & Ratio Reasoning',
    placementRelevance: 0.85,
    baseSkillId: 'quant.arithmetic.percentage',
  },
  { id: 'quant.arithmetic.probability', domain: 'Quant', topic: 'Arithmetic', subtopic: 'Probability', label: 'Probability', placementRelevance: 0.6 },
  { id: 'quant.algebra.core', domain: 'Quant', topic: 'Algebra', label: 'Algebra', placementRelevance: 0.75 },
  { id: 'verbal.grammar.core', domain: 'Verbal', topic: 'Grammar', label: 'Grammar', placementRelevance: 0.5 },
];

export function bandFromRating(r: number): Question['difficultyBand'] {
  if (r <= -1.5) return 'foundation';
  if (r <= -0.5) return 'easy';
  if (r <= 0.5) return 'medium';
  if (r <= 1.5) return 'hard';
  return 'advanced';
}

let questionCounter = 0;
function q(partial: Partial<Question> & Pick<Question, 'skillId' | 'difficultyRating'>): Question {
  questionCounter += 1;
  return {
    id: partial.id ?? `q-${questionCounter.toString().padStart(4, '0')}`,
    format: 'mcq',
    difficultyBand: bandFromRating(partial.difficultyRating),
    isTransferVariant: false,
    isValidated: true,
    qualityScore: 0.9,
    isFlagged: false,
    tags: [],
    ...partial,
  };
}

export const QUESTIONS: Question[] = [
  // --- Percentage ---
  q({ skillId: 'quant.arithmetic.percentage', difficultyRating: -2, tags: ['foundation'] }),
  q({ skillId: 'quant.arithmetic.percentage', difficultyRating: -1, tags: ['foundation'] }),
  q({ skillId: 'quant.arithmetic.percentage', difficultyRating: -1, tags: ['foundation'] }),
  q({ skillId: 'quant.arithmetic.percentage', difficultyRating: 0, tags: ['application'] }),
  q({ skillId: 'quant.arithmetic.percentage', difficultyRating: 0, tags: ['application'] }),
  q({ skillId: 'quant.arithmetic.percentage', difficultyRating: 1, tags: ['application'] }),
  q({ skillId: 'quant.arithmetic.percentage', difficultyRating: 1, isTransferVariant: true, tags: ['business-scenario'] }),
  q({ skillId: 'quant.arithmetic.percentage', difficultyRating: 2, tags: ['application'] }),

  // --- Ratio ---
  q({ skillId: 'quant.arithmetic.ratio', difficultyRating: -1, tags: ['foundation'] }),
  q({ skillId: 'quant.arithmetic.ratio', difficultyRating: 0, tags: ['foundation'] }),
  q({ skillId: 'quant.arithmetic.ratio', difficultyRating: 0, tags: ['application'] }),
  q({ skillId: 'quant.arithmetic.ratio', difficultyRating: 1, tags: ['application'] }),

  // --- Mixed percentage + ratio: the "unknown, composite" skill from spec section 75 ---
  q({ skillId: 'quant.arithmetic.percentage_ratio_mixed', difficultyRating: -1, tags: ['mixed-concept'] }),
  q({ skillId: 'quant.arithmetic.percentage_ratio_mixed', difficultyRating: 0, tags: ['mixed-concept'] }),
  q({ skillId: 'quant.arithmetic.percentage_ratio_mixed', difficultyRating: 0, tags: ['mixed-concept', 'business-scenario'] }),
  q({ skillId: 'quant.arithmetic.percentage_ratio_mixed', difficultyRating: 1, tags: ['mixed-concept'] }),

  // --- Probability: spec sections 11, 76, 80 ---
  q({ skillId: 'quant.arithmetic.probability', difficultyRating: -2, tags: ['foundation'] }),
  q({ skillId: 'quant.arithmetic.probability', difficultyRating: -1, tags: ['foundation'] }),
  q({ skillId: 'quant.arithmetic.probability', difficultyRating: 0, tags: ['application'] }),
  q({ skillId: 'quant.arithmetic.probability', difficultyRating: 1, tags: ['application'] }),
  q({ skillId: 'quant.arithmetic.probability', difficultyRating: 1.5, tags: ['application'] }),
  q({ skillId: 'quant.arithmetic.probability', difficultyRating: 2, tags: ['application'] }),
  q({ skillId: 'quant.arithmetic.probability', difficultyRating: 2.2, isTransferVariant: true, tags: ['novel-representation'] }),
  q({ skillId: 'quant.arithmetic.probability', difficultyRating: 2.5, tags: ['application'] }),

  // --- Algebra: spec section 13 ---
  q({ skillId: 'quant.algebra.core', difficultyRating: -1, tags: ['foundation'] }),
  q({ skillId: 'quant.algebra.core', difficultyRating: -1, tags: ['foundation'] }),
  q({ skillId: 'quant.algebra.core', difficultyRating: 0, tags: ['application'] }),
  q({ skillId: 'quant.algebra.core', difficultyRating: 1, tags: ['application'] }),
  q({ skillId: 'quant.algebra.core', difficultyRating: 1, tags: ['application'] }),

  // --- Grammar: spec section 77 ---
  q({ skillId: 'verbal.grammar.core', difficultyRating: -1, tags: ['foundation'] }),
  q({ skillId: 'verbal.grammar.core', difficultyRating: 0, tags: ['application'] }),
  q({ skillId: 'verbal.grammar.core', difficultyRating: 0, tags: ['application'] }),
  q({ skillId: 'verbal.grammar.core', difficultyRating: 0.2, tags: ['application'] }),
];
