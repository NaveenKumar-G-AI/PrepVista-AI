import type { Capability, Target } from '@/lib/db/schema';

// Capability IDs are shared across targets on purpose (spec §51/§52 —
// evidence for a shared capability should carry across targets rather than
// being re-earned from zero every time a student's target changes).
export const CAP_FOUNDATIONS = 'cap_foundations';
export const CAP_APPLIED = 'cap_applied';
export const CAP_TRANSFER = 'cap_transfer';
export const CAP_DECISION = 'cap_decision';
export const CAP_COMMUNICATION = 'cap_communication';
export const CAP_DATA_INTERPRETATION = 'cap_data_interpretation';

export const CAPABILITIES: Capability[] = [
  { id: CAP_FOUNDATIONS, name: 'Technical Foundations', description: 'Core knowledge required before it can be applied.' },
  { id: CAP_APPLIED, name: 'Applied Problem Solving', description: 'Using foundations to solve realistic, concrete problems.' },
  { id: CAP_TRANSFER, name: 'Timed Transfer', description: 'Applying known patterns to unfamiliar variations under time pressure.' },
  { id: CAP_DECISION, name: 'Decision-Making', description: 'Making sound choices under constraint, especially time constraint.' },
  { id: CAP_COMMUNICATION, name: 'Technical Communication', description: 'Explaining an approach and its trade-offs clearly.' },
  { id: CAP_DATA_INTERPRETATION, name: 'Data Interpretation', description: 'Reading and reasoning correctly about tabular and statistical data.' },
];

const CAPABILITY_LABEL: Record<string, string> = Object.fromEntries(CAPABILITIES.map((c) => [c.id, c.name]));

export function getCapabilityLabel(capabilityId: string | null | undefined): string {
  if (!capabilityId) return 'Unspecified';
  return CAPABILITY_LABEL[capabilityId] ?? capabilityId;
}

export const TARGET_SOFTWARE_DEVELOPER = 'target_software_developer';
export const TARGET_DATA_ANALYST = 'target_data_analyst';

// This is the "default" / demo target — see spec §67. Weights sum to 100.
// Communication is tracked as a capability (state, ADAPT recommendations)
// but intentionally left out of the weighted formula: an MVP has no
// calibrated rubric for grading free-text communication objectively, and
// folding an ungraded dimension into a numeric readiness score would be the
// kind of fabricated precision spec §39/§62 explicitly rules out.
export const TARGETS: Target[] = [
  {
    id: TARGET_SOFTWARE_DEVELOPER,
    name: 'Software Developer',
    description: 'Entry/early-career software engineering roles: applied problem solving, debugging, and technical reasoning under time pressure.',
    requiredCapabilities: [
      { capabilityId: CAP_FOUNDATIONS, minProficiency: 70, weight: 20 },
      { capabilityId: CAP_APPLIED, minProficiency: 70, weight: 25 },
      { capabilityId: CAP_TRANSFER, minProficiency: 70, weight: 35 },
      { capabilityId: CAP_DECISION, minProficiency: 60, weight: 20 },
    ],
    readinessThreshold: 80,
  },
  {
    id: TARGET_DATA_ANALYST,
    name: 'Data Analyst',
    description: 'Entry-level analytics roles: data interpretation, correctness under ambiguity, and applying familiar techniques to new datasets.',
    requiredCapabilities: [
      { capabilityId: CAP_DATA_INTERPRETATION, minProficiency: 70, weight: 45 },
      { capabilityId: CAP_TRANSFER, minProficiency: 65, weight: 35 },
      { capabilityId: CAP_DECISION, minProficiency: 55, weight: 20 },
    ],
    readinessThreshold: 78,
  },
];

export function getTarget(targetId: string): Target | undefined {
  return TARGETS.find((t) => t.id === targetId);
}

// Maps a capability to the DimensionScores field that measures it. Shared by
// the evaluation, evidence, readiness, and path engines so the mapping is
// defined in exactly one place.
export function capabilityDimensionKey(capabilityId: string): 'capability' | 'application' | 'transfer' | 'decisionQuality' | 'completion' {
  switch (capabilityId) {
    case CAP_FOUNDATIONS:
    case CAP_DATA_INTERPRETATION:
      return 'capability';
    case CAP_APPLIED:
      return 'application';
    case CAP_TRANSFER:
      return 'transfer';
    case CAP_DECISION:
      return 'decisionQuality';
    case CAP_COMMUNICATION:
      return 'completion'; // weak proxy only — see note above
    default:
      return 'capability';
  }
}
