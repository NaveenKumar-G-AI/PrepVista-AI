import type { ProblemTemplate, StepTemplate } from './types.js';

/**
 * Matches the Section 48 UI mockup ("A box contains 5 red and 3 blue
 * balls...") and the Section 50 solution trace (identify total outcomes,
 * identify favorable outcomes, construct probability, simplify).
 */
function buildSteps(params: {
  container: string;
  favorableColor: string;
  otherColor: string;
  favorableCount: number;
  otherCount: number;
}): StepTemplate[] {
  const { container, favorableColor, otherColor, favorableCount, otherCount } = params;
  const total = favorableCount + otherCount;
  const probability = favorableCount / total;
  const simplified = simplifyFraction(favorableCount, total);

  return [
    {
      stepId: 'understand',
      sequence: 1,
      type: 'UNDERSTAND',
      objective: 'Identify what the problem is asking for.',
      prompt: `${container} contains ${favorableCount} ${favorableColor} and ${otherCount} ${otherColor} balls. One ball is drawn at random. What are we trying to find?`,
      skill: 'probability-basic',
      expectedInputType: 'TEXT',
      validation: {
        type: 'ANSWER_KEY',
        spec: {
          acceptable: [
            'probability',
            'the probability',
            `probability of ${favorableColor}`,
            `probability it is ${favorableColor}`,
            `probability the ball is ${favorableColor}`,
          ],
        },
      },
      difficulty: 'EASY',
      hintLadder: [
        'What kind of quantity is being asked for - a count, or a chance?',
        `The question ends by asking how likely it is that the ball is ${favorableColor} - that's a probability.`,
      ],
      explanation: 'Naming what you are solving for keeps the rest of the steps aimed at the right target.',
    },
    {
      stepId: 'identify_total',
      sequence: 2,
      type: 'IDENTIFY',
      objective: 'Count the total number of equally likely outcomes.',
      prompt: 'How many total outcomes are possible?',
      skill: 'probability-basic',
      expectedInputType: 'NUMERIC',
      validation: { type: 'NUMERIC_TOLERANCE', spec: { expected: total } },
      difficulty: 'EASY',
      hintLadder: ['Every ball in the box is a possible outcome - how many balls are there in total?'],
      explanation: `The sample space is every ball that could be drawn: ${favorableCount} + ${otherCount} = ${total}.`,
    },
    {
      stepId: 'identify_favorable',
      sequence: 3,
      type: 'IDENTIFY',
      objective: 'Count the outcomes that satisfy what we want.',
      prompt: `How many favorable outcomes are there (${favorableColor} balls)?`,
      skill: 'probability-basic',
      expectedInputType: 'NUMERIC',
      validation: { type: 'NUMERIC_TOLERANCE', spec: { expected: favorableCount } },
      difficulty: 'EASY',
      hintLadder: [`Re-read the first sentence - how many ${favorableColor} balls were stated?`],
      explanation: `The favorable outcomes are exactly the ${favorableColor} balls: ${favorableCount} of them.`,
    },
    {
      stepId: 'construct_probability',
      sequence: 4,
      type: 'CALCULATE',
      objective: 'Combine favorable and total outcomes into a probability.',
      prompt: 'Calculate the probability: favorable outcomes ÷ total outcomes.',
      skill: 'probability-basic',
      expectedInputType: 'NUMERIC',
      validation: { type: 'NUMERIC_TOLERANCE', spec: { expected: probability, tolerance: 0.005 } },
      difficulty: 'MEDIUM',
      prerequisites: ['identify_total', 'identify_favorable'],
      hintLadder: [
        'Probability = favorable outcomes ÷ total outcomes.',
        `That's the count of ${favorableColor} balls divided by the total ball count.`,
      ],
      explanation:
        'Probability of an event is the count of favorable outcomes divided by the count of all equally likely outcomes.',
      deriveExpectedGivenPriorAttempts: (prior) => {
        const fav = prior['identify_favorable'];
        const tot = prior['identify_total'];
        if (fav === undefined || tot === undefined || tot === 0) return null;
        return fav / tot;
      },
    },
    {
      stepId: 'simplify',
      sequence: 5,
      type: 'VERIFY',
      objective: 'Express the result in its simplest fractional form.',
      prompt: 'Write the probability in its simplest fractional form.',
      skill: 'probability-basic',
      expectedInputType: 'TEXT',
      validation: { type: 'ANSWER_KEY', spec: { acceptable: [`${simplified.num}/${simplified.den}`] } },
      difficulty: 'MEDIUM',
      prerequisites: ['construct_probability'],
      hintLadder: [
        'Divide both the numerator and denominator by their greatest common factor.',
        `${favorableCount}/${total} shares a common factor - what is it?`,
      ],
      explanation: `${favorableCount}/${total} reduces to ${simplified.num}/${simplified.den} once you divide both by their greatest common factor.`,
    },
  ];
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
function simplifyFraction(numerator: number, denominator: number): { num: number; den: number } {
  const divisor = gcd(numerator, denominator) || 1;
  return { num: numerator / divisor, den: denominator / divisor };
}

export function buildProbabilityProblem(): ProblemTemplate {
  return {
    problemId: 'prob-box-6-4',
    type: 'PROBABILITY',
    title: 'Probability of drawing a red ball',
    promptText: 'A box contains 6 red and 4 blue balls. One ball is drawn at random. Find the probability that it is red.',
    skill: 'probability-basic',
    difficulty: 'MEDIUM',
    steps: buildSteps({ container: 'A box', favorableColor: 'red', otherColor: 'blue', favorableCount: 6, otherCount: 4 }),
    reconstructionPrompts: [
      {
        promptId: 'two_counts',
        prompt: 'What two counts did we need before we could calculate the probability?',
        acceptable: ['total outcomes and favorable outcomes', 'favorable and total', 'total and favorable outcomes'],
      },
      {
        promptId: 'formula',
        prompt: 'What formula connects them?',
        acceptable: ['probability = favorable / total', 'favorable/total', 'favorable ÷ total', 'favorable / total'],
      },
    ],
    transferVariants: [
      {
        variantId: 'prob-bag-4-6',
        title: 'Probability of drawing a green marble',
        promptText: 'A bag contains 4 green and 6 yellow marbles. One is drawn at random. Find the probability that it is green.',
        steps: buildSteps({ container: 'A bag', favorableColor: 'green', otherColor: 'yellow', favorableCount: 4, otherCount: 6 }),
      },
    ],
  };
}
