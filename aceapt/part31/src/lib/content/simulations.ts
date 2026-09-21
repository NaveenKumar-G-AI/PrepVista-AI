import type { Simulation } from '@/lib/db/schema';
import { CAP_APPLIED, CAP_DECISION, CAP_FOUNDATIONS, CAP_TRANSFER, CAP_COMMUNICATION, CAP_DATA_INTERPRETATION, TARGET_DATA_ANALYST, TARGET_SOFTWARE_DEVELOPER } from './targets';

export const SIM_SDE_REALISTIC = 'sim_sde_realistic';
export const SIM_DA_REALISTIC = 'sim_da_realistic';

export const SIMULATIONS: Simulation[] = [
  {
    id: SIM_SDE_REALISTIC,
    targetId: TARGET_SOFTWARE_DEVELOPER,
    title: 'Software Developer — Realistic Target Simulation',
    type: 'multi_stage',
    level: 3,
    description:
      'A realistic, multi-stage simulation of the technical evaluation you are likely to face for this target: foundations, applied problem solving, unfamiliar transfer scenarios, and a decision point under time pressure.',
    rules: [
      'Each stage has its own time budget. Unused time does not carry over to the next stage.',
      'You cannot go back and change an answer once it is submitted.',
      'No external notes or resources — respond as you would in the real evaluation.',
      'Multiple-choice and decision items are scored automatically and immediately upon submission (but not shown to you until the end).',
      'Written responses are captured as evidence of your reasoning and communication, not auto-graded for correctness.',
      'If time runs out, the simulation finalizes automatically using whatever you completed.',
      'Your result contributes to your ACEAPT readiness evidence for this target.',
    ],
    stageTemplates: [
      {
        id: 'stage_foundations',
        title: 'Technical Foundations',
        purpose: 'Establish baseline technical knowledge required for this target.',
        capabilityIds: [CAP_FOUNDATIONS],
        transfer: false,
        itemCount: 4,
        timeBudgetSeconds: 480,
        itemPoolTags: ['sde_foundations'],
      },
      {
        id: 'stage_applied',
        title: 'Applied Problem Solving',
        purpose: 'Measure your ability to apply foundational knowledge to realistic engineering problems.',
        capabilityIds: [CAP_APPLIED],
        transfer: false,
        itemCount: 3,
        timeBudgetSeconds: 720,
        itemPoolTags: ['sde_applied'],
      },
      {
        id: 'stage_transfer',
        title: 'Timed Transfer',
        purpose: 'Test whether your capability holds up on unfamiliar variations, under tighter time pressure.',
        capabilityIds: [CAP_TRANSFER],
        transfer: true,
        itemCount: 4,
        timeBudgetSeconds: 600,
        itemPoolTags: ['sde_transfer'],
      },
      {
        id: 'stage_decision',
        title: 'Decision Point',
        purpose: 'Observe decision-making under constraint.',
        capabilityIds: [CAP_DECISION],
        transfer: false,
        itemCount: 1,
        timeBudgetSeconds: 180,
        itemPoolTags: ['sde_decision'],
      },
      {
        id: 'stage_wrapup',
        title: 'Wrap-Up',
        purpose: 'Capture your ability to communicate your approach and recovery plan.',
        capabilityIds: [CAP_COMMUNICATION],
        transfer: false,
        itemCount: 1,
        timeBudgetSeconds: 240,
        itemPoolTags: ['sde_wrapup'],
      },
    ],
  },
  {
    id: SIM_DA_REALISTIC,
    targetId: TARGET_DATA_ANALYST,
    title: 'Data Analyst — Realistic Target Simulation',
    type: 'multi_stage',
    level: 3,
    description: 'A shorter multi-stage simulation covering data interpretation foundations, transfer to unfamiliar scenarios, and a decision point under ambiguity.',
    rules: [
      'Each stage has its own time budget. Unused time does not carry over to the next stage.',
      'You cannot go back and change an answer once it is submitted.',
      'If time runs out, the simulation finalizes automatically using whatever you completed.',
      'Your result contributes to your ACEAPT readiness evidence for this target.',
    ],
    stageTemplates: [
      {
        id: 'stage_da_foundations',
        title: 'Data Foundations',
        purpose: 'Establish baseline data interpretation and query knowledge.',
        capabilityIds: [CAP_DATA_INTERPRETATION],
        transfer: false,
        itemCount: 3,
        timeBudgetSeconds: 420,
        itemPoolTags: ['da_foundations'],
      },
      {
        id: 'stage_da_transfer',
        title: 'Timed Transfer',
        purpose: 'Test whether the same underlying instincts transfer to unfamiliar data scenarios under time pressure.',
        capabilityIds: [CAP_TRANSFER],
        transfer: true,
        itemCount: 3,
        timeBudgetSeconds: 420,
        itemPoolTags: ['da_transfer'],
      },
      {
        id: 'stage_da_decision',
        title: 'Decision Point',
        purpose: 'Observe decision-making under an ambiguous, real deadline-vs-accuracy trade-off.',
        capabilityIds: [CAP_DECISION],
        transfer: false,
        itemCount: 1,
        timeBudgetSeconds: 180,
        itemPoolTags: ['da_decision'],
      },
    ],
  },
];

export function getSimulation(simulationId: string): Simulation | undefined {
  return SIMULATIONS.find((s) => s.id === simulationId);
}

export function listSimulationsForTarget(targetId: string): Simulation[] {
  return SIMULATIONS.filter((s) => s.targetId === targetId);
}

export function simulationTotalDuration(sim: Simulation): number {
  return sim.stageTemplates.reduce((sum, st) => sum + st.timeBudgetSeconds, 0);
}
