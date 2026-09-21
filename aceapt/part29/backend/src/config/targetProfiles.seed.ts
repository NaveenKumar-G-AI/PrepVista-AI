import { TargetProfile } from '../domain/types';

/**
 * Target profiles are configuration, not code. This file is the entire
 * "target market" for the prototype (spec §13, §49) — add a target by
 * adding an entry here (or, later, by writing rows into target_profiles /
 * target_capability_requirements directly; `seedTargetProfiles.ts` upserts
 * from whichever source you point it at).
 *
 * required_level is the bar a CORE/IMPORTANT/SUPPORTING requirement expects;
 * it is a configured expectation, not a labor-market claim — see spec §23
 * ("do not make unsupported job-market claims").
 */
export const TARGET_PROFILES_SEED: TargetProfile[] = [
  {
    targetId: 'software_developer',
    name: 'Software Developer',
    description:
      'Builds and maintains software applications; strongest fit for students who can turn logical structure into working, correct code under time pressure.',
    active: true,
    typicalPreparationWeeks: 12,
    requirements: [
      { capabilityId: 'programming', importance: 'CORE', requiredLevel: 'STRONG' },
      { capabilityId: 'problem_solving', importance: 'CORE', requiredLevel: 'STRONG' },
      { capabilityId: 'logical_reasoning', importance: 'IMPORTANT', requiredLevel: 'MEDIUM' },
      { capabilityId: 'technical_fundamentals', importance: 'IMPORTANT', requiredLevel: 'MEDIUM' },
      { capabilityId: 'communication', importance: 'IMPORTANT', requiredLevel: 'MEDIUM' },
      { capabilityId: 'quant_reasoning', importance: 'SUPPORTING', requiredLevel: 'DEVELOPING' },
      { capabilityId: 'time_pressure_handling', importance: 'SUPPORTING', requiredLevel: 'MEDIUM' },
    ],
  },
  {
    targetId: 'data_analyst',
    name: 'Data Analyst',
    description:
      'Turns raw data into decisions; strongest fit for students whose quantitative reasoning and data interpretation are consistently ahead of the rest of their profile.',
    active: true,
    typicalPreparationWeeks: 8,
    requirements: [
      { capabilityId: 'quant_reasoning', importance: 'CORE', requiredLevel: 'STRONG' },
      { capabilityId: 'data_interpretation', importance: 'CORE', requiredLevel: 'STRONG' },
      { capabilityId: 'logical_reasoning', importance: 'IMPORTANT', requiredLevel: 'MEDIUM' },
      { capabilityId: 'technical_fundamentals', importance: 'IMPORTANT', requiredLevel: 'MEDIUM' },
      { capabilityId: 'communication', importance: 'IMPORTANT', requiredLevel: 'MEDIUM' },
      { capabilityId: 'programming', importance: 'SUPPORTING', requiredLevel: 'DEVELOPING' },
      { capabilityId: 'pattern_recognition', importance: 'SUPPORTING', requiredLevel: 'MEDIUM' },
    ],
  },
  {
    targetId: 'business_analyst',
    name: 'Business Analyst',
    description:
      'Bridges business needs and technical delivery; strongest fit for students who pair clear communication with solid quantitative and logical grounding.',
    active: true,
    typicalPreparationWeeks: 8,
    requirements: [
      { capabilityId: 'communication', importance: 'CORE', requiredLevel: 'STRONG' },
      { capabilityId: 'problem_solving', importance: 'CORE', requiredLevel: 'MEDIUM' },
      { capabilityId: 'data_interpretation', importance: 'IMPORTANT', requiredLevel: 'MEDIUM' },
      { capabilityId: 'quant_reasoning', importance: 'IMPORTANT', requiredLevel: 'MEDIUM' },
      { capabilityId: 'logical_reasoning', importance: 'IMPORTANT', requiredLevel: 'MEDIUM' },
      { capabilityId: 'technical_fundamentals', importance: 'SUPPORTING', requiredLevel: 'DEVELOPING' },
      { capabilityId: 'consistency', importance: 'SUPPORTING', requiredLevel: 'MEDIUM' },
    ],
  },
  {
    targetId: 'qa_engineer',
    name: 'QA Engineer',
    description:
      'Finds what breaks before users do; strongest fit for students with sharp pattern recognition and highly consistent, repeatable performance.',
    active: true,
    typicalPreparationWeeks: 10,
    requirements: [
      { capabilityId: 'pattern_recognition', importance: 'CORE', requiredLevel: 'STRONG' },
      { capabilityId: 'consistency', importance: 'CORE', requiredLevel: 'STRONG' },
      { capabilityId: 'technical_fundamentals', importance: 'IMPORTANT', requiredLevel: 'MEDIUM' },
      { capabilityId: 'problem_solving', importance: 'IMPORTANT', requiredLevel: 'MEDIUM' },
      { capabilityId: 'programming', importance: 'IMPORTANT', requiredLevel: 'DEVELOPING' },
      { capabilityId: 'communication', importance: 'SUPPORTING', requiredLevel: 'MEDIUM' },
      { capabilityId: 'time_pressure_handling', importance: 'SUPPORTING', requiredLevel: 'MEDIUM' },
    ],
  },
  {
    targetId: 'technical_support',
    name: 'Technical Support',
    description:
      'Diagnoses and resolves user-facing issues under time pressure; strongest fit for students who communicate clearly while staying calm and consistent.',
    active: true,
    typicalPreparationWeeks: 6,
    requirements: [
      { capabilityId: 'communication', importance: 'CORE', requiredLevel: 'STRONG' },
      { capabilityId: 'problem_solving', importance: 'CORE', requiredLevel: 'MEDIUM' },
      { capabilityId: 'technical_fundamentals', importance: 'IMPORTANT', requiredLevel: 'MEDIUM' },
      { capabilityId: 'consistency', importance: 'IMPORTANT', requiredLevel: 'MEDIUM' },
      { capabilityId: 'time_pressure_handling', importance: 'IMPORTANT', requiredLevel: 'MEDIUM' },
      { capabilityId: 'logical_reasoning', importance: 'SUPPORTING', requiredLevel: 'DEVELOPING' },
      { capabilityId: 'programming', importance: 'SUPPORTING', requiredLevel: 'DEVELOPING' },
    ],
  },
  {
    targetId: 'ai_ml',
    name: 'AI/ML',
    description:
      'Builds and reasons about learning systems; strongest fit for students who combine strong programming with genuine novel-problem transfer, not just memorized patterns.',
    active: true,
    typicalPreparationWeeks: 16,
    requirements: [
      { capabilityId: 'ml_fundamentals', importance: 'CORE', requiredLevel: 'STRONG' },
      { capabilityId: 'programming', importance: 'CORE', requiredLevel: 'STRONG' },
      { capabilityId: 'quant_reasoning', importance: 'IMPORTANT', requiredLevel: 'STRONG' },
      { capabilityId: 'novel_problem_solving', importance: 'IMPORTANT', requiredLevel: 'MEDIUM' },
      { capabilityId: 'pattern_recognition', importance: 'IMPORTANT', requiredLevel: 'MEDIUM' },
      { capabilityId: 'data_interpretation', importance: 'SUPPORTING', requiredLevel: 'MEDIUM' },
      { capabilityId: 'communication', importance: 'SUPPORTING', requiredLevel: 'DEVELOPING' },
    ],
  },
  {
    targetId: 'cloud_devops',
    name: 'Cloud/DevOps',
    description:
      'Keeps systems running and deployable; strongest fit for students with strong infrastructure fundamentals and steady, repeatable execution.',
    active: true,
    typicalPreparationWeeks: 14,
    requirements: [
      { capabilityId: 'cloud_devops_fundamentals', importance: 'CORE', requiredLevel: 'STRONG' },
      { capabilityId: 'technical_fundamentals', importance: 'CORE', requiredLevel: 'STRONG' },
      { capabilityId: 'programming', importance: 'IMPORTANT', requiredLevel: 'MEDIUM' },
      { capabilityId: 'problem_solving', importance: 'IMPORTANT', requiredLevel: 'MEDIUM' },
      { capabilityId: 'consistency', importance: 'IMPORTANT', requiredLevel: 'MEDIUM' },
      { capabilityId: 'communication', importance: 'SUPPORTING', requiredLevel: 'DEVELOPING' },
      { capabilityId: 'time_pressure_handling', importance: 'SUPPORTING', requiredLevel: 'MEDIUM' },
    ],
  },
];
