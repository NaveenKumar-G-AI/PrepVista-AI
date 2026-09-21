import type { ProblemTemplate, StepTemplate } from './types.js';

function buildSteps(params: { scored: number; total: number }): StepTemplate[] {
  const { scored, total } = params;
  const percentage = (scored / total) * 100;

  return [
    {
      stepId: 'understand',
      sequence: 1,
      type: 'UNDERSTAND',
      objective: 'Identify what the problem is asking for.',
      prompt: `A student scored ${scored} marks out of ${total}. What are we trying to find?`,
      skill: 'percentages',
      expectedInputType: 'TEXT',
      validation: {
        type: 'ANSWER_KEY',
        spec: { acceptable: ['percentage', 'the percentage', 'percentage scored', 'percent scored', 'percent'] },
      },
      difficulty: 'EASY',
      hintLadder: ['The question asks for a score "out of 100" equivalent - what is that called?'],
      explanation: 'Converting a score out of some total into an "out of 100" figure is finding a percentage.',
    },
    {
      stepId: 'identify',
      sequence: 2,
      type: 'IDENTIFY',
      objective: 'Write down the known values.',
      prompt: 'Fill in the known values from the problem.',
      skill: 'percentages',
      expectedInputType: 'STRUCTURED_FIELDS',
      validation: {
        type: 'STRUCTURED_FIELD_SET',
        spec: {
          fields: [
            { key: 'scored', expected: scored, label: 'Marks scored' },
            { key: 'total', expected: total, label: 'Total marks' },
          ],
        },
      },
      difficulty: 'EASY',
      hintLadder: ['Both numbers you need are in the first sentence.'],
      explanation: 'Writing down the scored and total marks first keeps the next step unambiguous.',
    },
    {
      stepId: 'calculate',
      sequence: 3,
      type: 'CALCULATE',
      objective: 'Apply the percentage formula.',
      prompt: 'Calculate the percentage: (scored ÷ total) × 100.',
      skill: 'percentages',
      expectedInputType: 'NUMERIC',
      validation: { type: 'NUMERIC_TOLERANCE', spec: { expected: percentage, tolerance: 0.1 } },
      difficulty: 'MEDIUM',
      prerequisites: ['identify'],
      hintLadder: ['Divide the marks scored by the total, then multiply by 100.'],
      explanation: `Percentage = (scored ÷ total) × 100 = (${scored} ÷ ${total}) × 100.`,
      deriveExpectedGivenPriorAttempts: (prior) => {
        const s = prior['identify.scored'];
        const t = prior['identify.total'];
        if (s === undefined || t === undefined || t === 0) return null;
        return (s / t) * 100;
      },
    },
    {
      stepId: 'verify_unit',
      sequence: 4,
      type: 'VERIFY',
      objective: 'Express the final answer with the correct unit.',
      prompt: 'State your final answer as a percentage.',
      skill: 'percentages',
      expectedInputType: 'UNIT_VALUE',
      validation: {
        type: 'UNIT_VALUE',
        spec: { expectedValue: percentage, expectedUnit: '%', tolerance: 0.1, unitAliases: { percent: '%', pct: '%', '%': '%' } },
      },
      difficulty: 'EASY',
      prerequisites: ['calculate'],
      hintLadder: ['A percentage answer should end with a % sign.'],
      explanation: 'A ratio multiplied by 100 is only meaningful as a percentage once you attach the % sign.',
      deriveExpectedGivenPriorAttempts: (prior) => prior['calculate'] ?? null,
    },
  ];
}

export function buildPercentageProblem(): ProblemTemplate {
  return {
    problemId: 'pct-marks-45-60',
    type: 'ARITHMETIC',
    title: 'Exam score as a percentage',
    promptText: 'A student scored 45 marks out of 60. What percentage did they score?',
    skill: 'percentages',
    difficulty: 'EASY',
    steps: buildSteps({ scored: 45, total: 60 }),
    reconstructionPrompts: [
      {
        promptId: 'formula',
        prompt: 'What formula did we use?',
        acceptable: ['(scored / total) * 100', 'scored/total*100', 'scored ÷ total × 100'],
      },
    ],
    transferVariants: [
      {
        variantId: 'pct-marks-39-50',
        title: 'Exam score as a percentage (variant)',
        promptText: 'A student scored 39 marks out of 50. What percentage did they score?',
        steps: buildSteps({ scored: 39, total: 50 }),
      },
    ],
  };
}
