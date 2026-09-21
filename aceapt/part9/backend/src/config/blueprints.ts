import { Difficulty, PressureMode, SimulationBlueprint } from '../domain/types';

// ============================================================
// SIMULATION BLUEPRINTS  (spec sections 11, 12, 21)
// ============================================================
// Reuse the existing ACEAPT assessment configuration model if one
// already exists in your repo - this file is deliberately isolated
// so that swapping it for a real BlueprintRepository is a one-file
// change (see BlueprintService below and INTEGRATION.md).

const QUICK_SIMULATION: SimulationBlueprint = {
  id: 'quick-simulation-v1',
  name: 'Quick Simulation',
  mode: 'QUICK_SIMULATION',
  durationSeconds: 600, // 10 minutes
  questionCount: 8,
  skillDistribution: [
    { skill: 'arithmetic', count: 1 },
    { skill: 'logical_reasoning', count: 1 },
    { skill: 'data_interpretation', count: 1 },
    { skill: 'verbal_ability', count: 1 },
    { skill: 'number_system', count: 1 },
    { skill: 'ratio_proportion', count: 1 },
    { skill: 'percentage', count: 1 },
    { skill: 'probability', count: 1 },
  ],
  // Mirrors the worked example in spec section 10 exactly.
  difficultySequence: ['easy', 'medium', 'medium', 'hard', 'easy', 'medium', 'hard', 'medium'],
  negativeMarking: { correct: 1, wrong: 0, skipped: 0 },
  allowSkip: true,
  allowReturn: true,
  hideTopicLabels: true,
  pressureMode: 'NORMAL',
};

const STANDARD_SIMULATION: SimulationBlueprint = {
  id: 'standard-simulation-v1',
  name: 'Standard Simulation',
  mode: 'STANDARD_SIMULATION',
  durationSeconds: 1500, // 25 minutes
  questionCount: 16,
  skillDistribution: [
    { skill: 'arithmetic', count: 2 },
    { skill: 'logical_reasoning', count: 2 },
    { skill: 'data_interpretation', count: 2 },
    { skill: 'verbal_ability', count: 1 },
    { skill: 'number_system', count: 1 },
    { skill: 'algebra', count: 1 },
    { skill: 'ratio_proportion', count: 2 },
    { skill: 'percentage', count: 2 },
    { skill: 'probability', count: 2 },
    { skill: 'geometry', count: 1 },
  ],
  difficultySequence: [
    'easy', 'medium', 'easy', 'medium', 'hard', 'medium', 'easy', 'medium',
    'hard', 'easy', 'medium', 'medium', 'hard', 'easy', 'medium', 'easy',
  ],
  negativeMarking: { correct: 1, wrong: -0.25, skipped: 0 },
  allowSkip: true,
  allowReturn: true,
  hideTopicLabels: true,
  pressureMode: 'COMPETITIVE',
};

const FULL_SIMULATION: SimulationBlueprint = {
  id: 'full-simulation-v1',
  name: 'Full Simulation',
  mode: 'FULL_SIMULATION',
  durationSeconds: 2700, // 45 minutes
  questionCount: 24,
  skillDistribution: [
    { skill: 'arithmetic', count: 3 },
    { skill: 'logical_reasoning', count: 3 },
    { skill: 'data_interpretation', count: 3 },
    { skill: 'percentage', count: 3 },
    { skill: 'verbal_ability', count: 2 },
    { skill: 'number_system', count: 2 },
    { skill: 'algebra', count: 2 },
    { skill: 'ratio_proportion', count: 2 },
    { skill: 'probability', count: 2 },
    { skill: 'geometry', count: 2 },
  ],
  difficultySequence: [
    'easy', 'medium', 'medium', 'hard', 'easy', 'medium', 'easy', 'hard',
    'medium', 'medium', 'easy', 'hard', 'medium', 'easy', 'medium', 'hard',
    'easy', 'medium', 'medium', 'easy', 'hard', 'medium', 'easy', 'medium',
  ] as Difficulty[],
  negativeMarking: { correct: 1, wrong: -0.33, skipped: 0 },
  allowSkip: true,
  allowReturn: true,
  hideTopicLabels: true,
  pressureMode: 'STRICT',
};

const BLUEPRINTS: Record<string, SimulationBlueprint> = {
  [QUICK_SIMULATION.id]: QUICK_SIMULATION,
  [STANDARD_SIMULATION.id]: STANDARD_SIMULATION,
  [FULL_SIMULATION.id]: FULL_SIMULATION,
};

export function getBlueprintById(id: string): SimulationBlueprint | undefined {
  return BLUEPRINTS[id];
}

export function listBlueprints(): SimulationBlueprint[] {
  return Object.values(BLUEPRINTS);
}

/**
 * Applies pressure-mode modifiers to a blueprint. Deliberately numeric
 * only (duration + negative marking) - no fake urgency, no flashing UI,
 * per spec section 21 ("Do not use anxiety-inducing gimmicks").
 * A CUSTOM_SIMULATION blueprint (institution-defined, spec section 12)
 * can be built by calling this against a hand-assembled blueprint object
 * that follows the same shape.
 */
export function applyPressureModifiers(
  blueprint: SimulationBlueprint,
  pressureMode: PressureMode,
): SimulationBlueprint {
  switch (pressureMode) {
    case 'NORMAL':
      return { ...blueprint, pressureMode };
    case 'COMPETITIVE':
      // Same time budget; only the client UI should emphasize remaining time.
      return { ...blueprint, pressureMode };
    case 'STRICT':
      return {
        ...blueprint,
        pressureMode,
        durationSeconds: Math.round(blueprint.durationSeconds * 0.85),
      };
    case 'HIGH_PRESSURE':
      return {
        ...blueprint,
        pressureMode,
        durationSeconds: Math.round(blueprint.durationSeconds * 0.7),
        negativeMarking: {
          ...blueprint.negativeMarking,
          wrong: round1(blueprint.negativeMarking.wrong * 1.2),
        },
      };
    default:
      return blueprint;
  }
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
