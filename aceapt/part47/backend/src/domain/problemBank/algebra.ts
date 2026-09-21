import type { ProblemTemplate, StepTemplate } from './types.js';

/**
 * Kept intentionally smaller than the other three problems - it exists to
 * exercise the ALGEBRAIC_EQUIVALENCE validator and the alternateMethods
 * data shape (Section 73-74) with real, working code. Fleshing out a fully
 * independent step-by-step grading path for the alternate method is a
 * reasonable next increment; see docs/limitations in the README.
 */
function buildSteps(params: { a: number; b: number; c: number }): { steps: StepTemplate[]; x: number } {
  const { a, b, c } = params; // a*x + b = c
  const x = (c - b) / a;

  const steps: StepTemplate[] = [
    {
      stepId: 'select_operation',
      sequence: 1,
      type: 'SELECT',
      objective: 'Choose the operation that isolates the x-term.',
      prompt: `Solve for x: ${a}x + ${b} = ${c}. Which operation should we apply to both sides first?`,
      skill: 'linear-equations',
      expectedInputType: 'CHOICE',
      validation: {
        type: 'MULTIPLE_CHOICE',
        spec: {
          correctOptionId: 'a',
          options: [
            { id: 'a', label: `Subtract ${b} from both sides` },
            { id: 'b', label: `Multiply both sides by ${a}` },
            { id: 'c', label: `Add ${b} to both sides` },
          ],
        },
      },
      difficulty: 'MEDIUM',
      hintLadder: [
        `The x-term is added to ${b} - which operation undoes addition?`,
        `Subtracting ${b} from both sides leaves ${a}x alone on the left.`,
      ],
      explanation: `To isolate the x-term, undo the "+${b}" by subtracting ${b} from both sides.`,
    },
    {
      stepId: 'solve_x',
      sequence: 2,
      type: 'CALCULATE',
      objective: 'Solve the resulting equation for x.',
      prompt: 'Solve for x and enter the result (e.g. "x = 5").',
      skill: 'linear-equations',
      expectedInputType: 'TEXT',
      validation: { type: 'ALGEBRAIC_EQUIVALENCE', spec: { expectedExpression: `x = ${x}` } },
      difficulty: 'MEDIUM',
      prerequisites: ['select_operation'],
      hintLadder: [
        `After subtracting, you should have ${a}x = ${c - b}. What do you divide by to finish?`,
        `${a}x = ${c - b} divided by ${a} gives x.`,
      ],
      explanation: `${a}x + ${b} = ${c} becomes ${a}x = ${c - b} after subtracting ${b}, then x = ${c - b} ÷ ${a} = ${x}.`,
    },
  ];

  return { steps, x };
}

export function buildAlgebraProblem(): ProblemTemplate {
  const { steps, x } = buildSteps({ a: 3, b: 5, c: 20 });
  const variant = buildSteps({ a: 4, b: 7, c: 31 });

  return {
    problemId: 'alg-linear-3x5-20',
    type: 'ALGEBRA',
    title: 'Solve a linear equation',
    promptText: 'Solve for x: 3x + 5 = 20.',
    skill: 'linear-equations',
    difficulty: 'MEDIUM',
    steps,
    alternateMethods: [
      {
        methodId: 'divide_first',
        label: 'Divide first, then adjust',
        steps: [
          {
            stepId: 'alt_divide_first',
            sequence: 1,
            type: 'CALCULATE',
            objective: 'Show that dividing before isolating the constant is also valid.',
            prompt: 'Divide every term by 3 first, then solve for x. Enter the result (e.g. "x = 5").',
            skill: 'linear-equations',
            expectedInputType: 'TEXT',
            validation: { type: 'ALGEBRAIC_EQUIVALENCE', spec: { expectedExpression: `x = ${x}` } },
            difficulty: 'HARD',
            hintLadder: ['Dividing first leaves fractions to clean up, but the final x is unchanged.'],
            explanation: 'Multiple algebraically valid orderings of operations reach the same value of x (Section 73-74).',
          },
        ],
      },
    ],
    reconstructionPrompts: [
      { promptId: 'first_op', prompt: 'What operation did we apply to both sides first?', acceptable: ['subtract 5', 'subtract 5 from both sides'] },
      { promptId: 'final_x', prompt: 'What is the final value of x?', acceptable: [String(x), `x = ${x}`, `x=${x}`] },
    ],
    transferVariants: [
      {
        variantId: 'alg-linear-4x7-31',
        title: 'Solve a linear equation (variant)',
        promptText: 'Solve for x: 4x + 7 = 31.',
        steps: variant.steps,
      },
    ],
  };
}
