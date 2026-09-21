import type { ProblemTemplate, StepTemplate } from './types.js';

const UNIT_ALIASES = { hr: 'hours', hrs: 'hours', h: 'hours', hour: 'hours', hours: 'hours' };

/**
 * Builds the five-step decomposition from Section 117 (UNDERSTAND -> IDENTIFY
 * -> SELECT -> CALCULATE -> VERIFY) for any distance/speed pair, so the main
 * problem and its transfer variant (Section 30-31) are generated from one
 * real, shared structure instead of two hand-duplicated copies.
 *
 * Step 4 and Step 5 both define `deriveExpectedGivenPriorAttempts`, which is
 * what lets domain/engine/errorLocalization.ts correctly tell a genuinely
 * new mistake apart from one that is just carrying an earlier slip forward
 * (Section 18-19's own worked example is exactly this shape: a wrong
 * distance or speed at Step 2 should make Step 4 "wrong but consistent",
 * not a second independent error).
 */
function buildSteps(params: { subject: string; distance: number; speed: number }): StepTemplate[] {
  const { subject, distance, speed } = params;
  const time = distance / speed;

  return [
    {
      stepId: 'understand',
      sequence: 1,
      type: 'UNDERSTAND',
      objective: 'Identify what the problem is asking for.',
      prompt: `${subject} travels ${distance} km at a speed of ${speed} km/h. What are we trying to find?`,
      skill: 'speed-distance-time',
      expectedInputType: 'TEXT',
      validation: {
        type: 'ANSWER_KEY',
        spec: { acceptable: ['time', 'the time', 'time taken', 'how long it takes', 'duration'] },
      },
      difficulty: 'EASY',
      hintLadder: [
        "Look at the question again - what quantity is missing from what's given?",
        'Distance and speed are both stated. The one remaining quantity in "distance, speed, time" is the answer.',
      ],
      explanation:
        'Every problem is asking you to find something specific. Here distance and speed are both given, so the only remaining quantity is time.',
    },
    {
      stepId: 'identify',
      sequence: 2,
      type: 'IDENTIFY',
      objective: 'Write down the known values before choosing a method.',
      prompt: 'Fill in the known values from the problem statement.',
      skill: 'speed-distance-time',
      expectedInputType: 'STRUCTURED_FIELDS',
      validation: {
        type: 'STRUCTURED_FIELD_SET',
        spec: {
          fields: [
            { key: 'distance', expected: distance, label: 'Distance (km)' },
            { key: 'speed', expected: speed, label: 'Speed (km/h)' },
          ],
        },
      },
      difficulty: 'EASY',
      hintLadder: [
        'Re-read the problem statement - both numbers you need are stated directly.',
        `Distance is in km, speed is in km/h - they appear in the first sentence.`,
      ],
      explanation: 'Before choosing a method, write down exactly what the problem already tells you.',
    },
    {
      stepId: 'select_strategy',
      sequence: 3,
      type: 'SELECT',
      objective: 'Choose the relationship that connects distance, speed, and time.',
      prompt: 'Which relationship should we use to find time?',
      skill: 'speed-distance-time',
      expectedInputType: 'CHOICE',
      validation: {
        type: 'MULTIPLE_CHOICE',
        spec: {
          correctOptionId: 'a',
          options: [
            { id: 'a', label: 'Time = Distance ÷ Speed' },
            { id: 'b', label: 'Time = Distance × Speed' },
            { id: 'c', label: 'Time = Speed ÷ Distance' },
          ],
        },
      },
      difficulty: 'MEDIUM',
      hintLadder: [
        'Think about units: km ÷ (km/h) leaves you with hours - which option does that?',
        'At a fixed speed, going further should take MORE time, not less. Which formula reflects that?',
      ],
      explanation:
        'Speed = Distance ÷ Time rearranges to Time = Distance ÷ Speed - that is the relationship that connects all three quantities here.',
    },
    {
      stepId: 'calculate',
      sequence: 4,
      type: 'CALCULATE',
      objective: 'Execute the chosen relationship with the known values.',
      prompt: `Calculate the time: ${distance} ÷ ${speed}.`,
      skill: 'speed-distance-time',
      expectedInputType: 'NUMERIC',
      validation: { type: 'NUMERIC_TOLERANCE', spec: { expected: time, tolerance: 0.01 } },
      difficulty: 'EASY',
      prerequisites: ['select_strategy'],
      hintLadder: [
        'Divide the distance by the speed you identified above.',
        `${distance} divided by ${speed} - try simplifying the division into smaller steps if it helps.`,
      ],
      explanation: `With Time = Distance ÷ Speed and the values ${distance} km and ${speed} km/h, dividing gives the number of hours.`,
      deriveExpectedGivenPriorAttempts: (prior) => {
        const d = prior['identify.distance'];
        const s = prior['identify.speed'];
        if (d === undefined || s === undefined || s === 0) return null;
        return d / s;
      },
    },
    {
      stepId: 'verify_unit',
      sequence: 5,
      type: 'VERIFY',
      objective: "Confirm the final answer's unit matches the quantities used.",
      prompt: 'State your final answer, including its unit.',
      skill: 'speed-distance-time',
      expectedInputType: 'UNIT_VALUE',
      validation: {
        type: 'UNIT_VALUE',
        spec: { expectedValue: time, expectedUnit: 'hours', tolerance: 0.01, unitAliases: UNIT_ALIASES },
      },
      difficulty: 'EASY',
      prerequisites: ['calculate'],
      hintLadder: [
        'What unit does time come in when distance is in km and speed is in km/h?',
        'km divided by km/h always yields a result in hours.',
      ],
      explanation:
        'Distance in km divided by speed in km/h yields a result in hours - always check your final unit matches the units you started from.',
      deriveExpectedGivenPriorAttempts: (prior) => prior['calculate'] ?? null,
    },
  ];
}

export function buildSpeedDistanceTimeProblem(): ProblemTemplate {
  return {
    problemId: 'sdt-train-360-60',
    type: 'ARITHMETIC',
    title: 'Train travel time',
    promptText: 'A train travels 360 km at a speed of 60 km/h. Find the time taken.',
    skill: 'speed-distance-time',
    difficulty: 'EASY',
    steps: buildSteps({ subject: 'A train', distance: 360, speed: 60 }),
    reconstructionPrompts: [
      {
        promptId: 'formula',
        prompt: 'What formula did we use to find the time?',
        acceptable: [
          'time = distance / speed',
          'time = distance ÷ speed',
          'distance/speed',
          'distance / speed',
          'distance ÷ speed',
        ],
      },
      {
        promptId: 'first_operation',
        prompt: 'What was the first calculation we performed?',
        acceptable: ['divide distance by speed', '360 divided by 60', 'divide 360 by 60', 'division'],
      },
    ],
    transferVariants: [
      {
        variantId: 'sdt-cyclist-180-45',
        title: 'Cyclist travel time',
        promptText: 'A cyclist travels 180 km at a speed of 45 km/h. Find the time taken.',
        steps: buildSteps({ subject: 'A cyclist', distance: 180, speed: 45 }),
      },
    ],
  };
}
