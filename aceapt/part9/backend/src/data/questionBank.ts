import { Difficulty, Question, SkillId } from '../domain/types';

// ============================================================
// SEED QUESTION BANK
// ============================================================
// This is a small, original, hand-authored question set that stands in
// for ACEAPT's real question bank. In production this file disappears
// entirely: QuestionSelectionService should read from the real question
// repository (and, per spec section 44, from the AI-assisted question
// quality pipeline for any freshly generated items). Every question
// below carries an expectedSolveTimeSeconds, which the whole decision
// quality / time management / failure cascade layer depends on -
// replace it with your real per-question timing benchmark if you have
// one (e.g. p50 solve time observed across students).

function opt(id: string, text: string) {
  return { id, text };
}

export const QUESTION_BANK: Question[] = [
  // ---------------- arithmetic ----------------
  {
    id: 'ar-e1',
    skill: 'arithmetic',
    difficulty: 'easy',
    prompt: 'A shopkeeper buys a pen for ₹40 and sells it for ₹50. What is the profit percentage?',
    options: [opt('a', '20%'), opt('b', '25%'), opt('c', '10%'), opt('d', '15%')],
    correctOptionId: 'b',
    expectedSolveTimeSeconds: 40,
  },
  {
    id: 'ar-m1',
    skill: 'arithmetic',
    difficulty: 'medium',
    prompt: 'The sum of three consecutive even numbers is 90. What is the largest number?',
    options: [opt('a', '30'), opt('b', '32'), opt('c', '34'), opt('d', '28')],
    correctOptionId: 'b',
    expectedSolveTimeSeconds: 70,
  },
  {
    id: 'ar-h1',
    skill: 'arithmetic',
    difficulty: 'hard',
    prompt: '₹8,000 is invested at 10% per annum, compounded annually. What is the amount after 2 years?',
    options: [opt('a', '₹9,680'), opt('b', '₹9,600'), opt('c', '₹9,800'), opt('d', '₹8,800')],
    correctOptionId: 'a',
    expectedSolveTimeSeconds: 115,
  },

  // ---------------- logical_reasoning ----------------
  {
    id: 'lr-e1',
    skill: 'logical_reasoning',
    difficulty: 'easy',
    prompt: 'All Bloops are Razzles. All Razzles are Lazzles. Are all Bloops definitely Lazzles?',
    options: [opt('a', 'Yes, always'), opt('b', 'No, never'), opt('c', 'Cannot be determined'), opt('d', 'Only sometimes')],
    correctOptionId: 'a',
    expectedSolveTimeSeconds: 40,
  },
  {
    id: 'lr-m1',
    skill: 'logical_reasoning',
    difficulty: 'medium',
    prompt: 'Find the next number in the series: 2, 6, 12, 20, 30, ?',
    options: [opt('a', '40'), opt('b', '42'), opt('c', '44'), opt('d', '36')],
    correctOptionId: 'b',
    expectedSolveTimeSeconds: 65,
  },
  {
    id: 'lr-h1',
    skill: 'logical_reasoning',
    difficulty: 'hard',
    prompt: 'A is B\u2019s father. C is B\u2019s sister. How is C related to A?',
    options: [opt('a', 'Daughter'), opt('b', 'Son'), opt('c', 'Mother'), opt('d', 'Sister')],
    correctOptionId: 'a',
    expectedSolveTimeSeconds: 100,
  },

  // ---------------- data_interpretation ----------------
  {
    id: 'di-e1',
    skill: 'data_interpretation',
    difficulty: 'easy',
    prompt: 'A shop sold 120 units in January and 150 units in February. What is the percentage increase?',
    options: [opt('a', '25%'), opt('b', '20%'), opt('c', '30%'), opt('d', '15%')],
    correctOptionId: 'a',
    expectedSolveTimeSeconds: 45,
  },
  {
    id: 'di-m1',
    skill: 'data_interpretation',
    difficulty: 'medium',
    prompt: 'Out of 250 students, 40% play cricket and the rest play football. How many play football?',
    options: [opt('a', '150'), opt('b', '100'), opt('c', '140'), opt('d', '160')],
    correctOptionId: 'a',
    expectedSolveTimeSeconds: 75,
  },
  {
    id: 'di-h1',
    skill: 'data_interpretation',
    difficulty: 'hard',
    prompt: 'In a class, the ratio of boys to girls is 3:2. There are 10 more boys than girls. How many students are there in total?',
    options: [opt('a', '50'), opt('b', '40'), opt('c', '60'), opt('d', '45')],
    correctOptionId: 'a',
    expectedSolveTimeSeconds: 120,
  },

  // ---------------- verbal_ability ----------------
  {
    id: 'va-e1',
    skill: 'verbal_ability',
    difficulty: 'easy',
    prompt: 'Choose the word closest in meaning to "ample".',
    options: [opt('a', 'Plentiful'), opt('b', 'Scarce'), opt('c', 'Narrow'), opt('d', 'Weak')],
    correctOptionId: 'a',
    expectedSolveTimeSeconds: 30,
  },
  {
    id: 'va-m1',
    skill: 'verbal_ability',
    difficulty: 'medium',
    prompt: 'Book is to Library as Painting is to ____?',
    options: [opt('a', 'Gallery'), opt('b', 'Frame'), opt('c', 'Artist'), opt('d', 'Canvas')],
    correctOptionId: 'a',
    expectedSolveTimeSeconds: 50,
  },
  {
    id: 'va-h1',
    skill: 'verbal_ability',
    difficulty: 'hard',
    prompt: 'Choose the word that does NOT belong with the others: Meticulous, Careful, Precise, Careless.',
    options: [opt('a', 'Meticulous'), opt('b', 'Careful'), opt('c', 'Precise'), opt('d', 'Careless')],
    correctOptionId: 'd',
    expectedSolveTimeSeconds: 85,
  },

  // ---------------- number_system ----------------
  {
    id: 'ns-e1',
    skill: 'number_system',
    difficulty: 'easy',
    prompt: 'What is the remainder when 29 is divided by 6?',
    options: [opt('a', '5'), opt('b', '4'), opt('c', '3'), opt('d', '2')],
    correctOptionId: 'a',
    expectedSolveTimeSeconds: 35,
  },
  {
    id: 'ns-m1',
    skill: 'number_system',
    difficulty: 'medium',
    prompt: 'How many two-digit numbers are divisible by 7?',
    options: [opt('a', '13'), opt('b', '12'), opt('c', '14'), opt('d', '11')],
    correctOptionId: 'a',
    expectedSolveTimeSeconds: 75,
  },
  {
    id: 'ns-h1',
    skill: 'number_system',
    difficulty: 'hard',
    prompt: 'What is the smallest number that leaves a remainder of 2 when divided by both 5 and 7?',
    options: [opt('a', '37'), opt('b', '32'), opt('c', '42'), opt('d', '30')],
    correctOptionId: 'a',
    expectedSolveTimeSeconds: 110,
  },

  // ---------------- algebra ----------------
  {
    id: 'al-e1',
    skill: 'algebra',
    difficulty: 'easy',
    prompt: 'If 3x + 5 = 20, what is x?',
    options: [opt('a', '5'), opt('b', '4'), opt('c', '6'), opt('d', '3')],
    correctOptionId: 'a',
    expectedSolveTimeSeconds: 35,
  },
  {
    id: 'al-m1',
    skill: 'algebra',
    difficulty: 'medium',
    prompt: 'The sum of two numbers is 25 and their difference is 5. What is the larger number?',
    options: [opt('a', '15'), opt('b', '10'), opt('c', '20'), opt('d', '12')],
    correctOptionId: 'a',
    expectedSolveTimeSeconds: 60,
  },
  {
    id: 'al-h1',
    skill: 'algebra',
    difficulty: 'hard',
    prompt: 'If x\u00b2 - 5x + 6 = 0, what are the possible values of x?',
    options: [opt('a', '2 and 3'), opt('b', '1 and 6'), opt('c', '-2 and -3'), opt('d', '2 and 4')],
    correctOptionId: 'a',
    expectedSolveTimeSeconds: 100,
  },

  // ---------------- ratio_proportion ----------------
  {
    id: 'rp-e1',
    skill: 'ratio_proportion',
    difficulty: 'easy',
    prompt: 'Two numbers are in the ratio 3:4. If the smaller number is 15, what is the larger number?',
    options: [opt('a', '20'), opt('b', '18'), opt('c', '24'), opt('d', '16')],
    correctOptionId: 'a',
    expectedSolveTimeSeconds: 40,
  },
  {
    id: 'rp-m1',
    skill: 'ratio_proportion',
    difficulty: 'medium',
    prompt: 'A sum of ₹600 is divided among A, B and C in the ratio 2:3:5. What is C\u2019s share?',
    options: [opt('a', '₹300'), opt('b', '₹200'), opt('c', '₹250'), opt('d', '₹150')],
    correctOptionId: 'a',
    expectedSolveTimeSeconds: 70,
  },
  {
    id: 'rp-h1',
    skill: 'ratio_proportion',
    difficulty: 'hard',
    prompt: 'If a:b = 2:3 and b:c = 4:5, find a:b:c.',
    options: [opt('a', '8:12:15'), opt('b', '2:3:5'), opt('c', '6:9:10'), opt('d', '4:6:5')],
    correctOptionId: 'a',
    expectedSolveTimeSeconds: 110,
  },

  // ---------------- percentage ----------------
  {
    id: 'pc-e1',
    skill: 'percentage',
    difficulty: 'easy',
    prompt: 'What is 20% of 250?',
    options: [opt('a', '50'), opt('b', '40'), opt('c', '60'), opt('d', '45')],
    correctOptionId: 'a',
    expectedSolveTimeSeconds: 30,
  },
  {
    id: 'pc-m1',
    skill: 'percentage',
    difficulty: 'medium',
    prompt: 'A number is increased by 25% to become 100. What was the original number?',
    options: [opt('a', '80'), opt('b', '75'), opt('c', '85'), opt('d', '90')],
    correctOptionId: 'a',
    expectedSolveTimeSeconds: 65,
  },
  {
    id: 'pc-h1',
    skill: 'percentage',
    difficulty: 'hard',
    prompt: 'A trader marks up goods by 40% and then gives a discount of 10%. What is his overall profit percentage?',
    options: [opt('a', '26%'), opt('b', '30%'), opt('c', '24%'), opt('d', '20%')],
    correctOptionId: 'a',
    expectedSolveTimeSeconds: 105,
  },

  // ---------------- probability ----------------
  {
    id: 'pr-e1',
    skill: 'probability',
    difficulty: 'easy',
    prompt: 'A fair coin is tossed once. What is the probability of getting heads?',
    options: [opt('a', '1/2'), opt('b', '1/3'), opt('c', '1/4'), opt('d', '1')],
    correctOptionId: 'a',
    expectedSolveTimeSeconds: 25,
  },
  {
    id: 'pr-m1',
    skill: 'probability',
    difficulty: 'medium',
    prompt: 'A bag has 4 red and 6 blue balls. What is the probability of picking a red ball at random?',
    options: [opt('a', '2/5'), opt('b', '1/2'), opt('c', '3/5'), opt('d', '1/5')],
    correctOptionId: 'a',
    expectedSolveTimeSeconds: 55,
  },
  {
    id: 'pr-h1',
    skill: 'probability',
    difficulty: 'hard',
    prompt: 'Two dice are rolled together. What is the probability that the sum is 7?',
    options: [opt('a', '1/6'), opt('b', '1/12'), opt('c', '1/9'), opt('d', '1/4')],
    correctOptionId: 'a',
    expectedSolveTimeSeconds: 95,
  },

  // ---------------- geometry ----------------
  {
    id: 'ge-e1',
    skill: 'geometry',
    difficulty: 'easy',
    prompt: 'What is the sum of the interior angles of a triangle?',
    options: [opt('a', '180°'), opt('b', '360°'), opt('c', '90°'), opt('d', '270°')],
    correctOptionId: 'a',
    expectedSolveTimeSeconds: 25,
  },
  {
    id: 'ge-m1',
    skill: 'geometry',
    difficulty: 'medium',
    prompt: 'A rectangle has length 12 cm and breadth 5 cm. What is its area?',
    options: [opt('a', '60 cm²'), opt('b', '54 cm²'), opt('c', '70 cm²'), opt('d', '65 cm²')],
    correctOptionId: 'a',
    expectedSolveTimeSeconds: 40,
  },
  {
    id: 'ge-h1',
    skill: 'geometry',
    difficulty: 'hard',
    prompt: 'A circle has radius 7 cm. What is its approximate area? (use \u03c0 \u2248 22/7)',
    options: [opt('a', '154 cm²'), opt('b', '144 cm²'), opt('c', '164 cm²'), opt('d', '132 cm²')],
    correctOptionId: 'a',
    expectedSolveTimeSeconds: 80,
  },
];

const byId = new Map(QUESTION_BANK.map((q) => [q.id, q]));

export function getQuestionById(id: string): Question | undefined {
  return byId.get(id);
}

export function getQuestionsBySkill(skill: SkillId): Question[] {
  return QUESTION_BANK.filter((q) => q.skill === skill);
}

export function getQuestionsBySkillAndDifficulty(skill: SkillId, difficulty: Difficulty): Question[] {
  return QUESTION_BANK.filter((q) => q.skill === skill && q.difficulty === difficulty);
}

export const ALL_SKILLS: SkillId[] = [
  'arithmetic',
  'logical_reasoning',
  'data_interpretation',
  'verbal_ability',
  'number_system',
  'algebra',
  'ratio_proportion',
  'percentage',
  'probability',
  'geometry',
];
