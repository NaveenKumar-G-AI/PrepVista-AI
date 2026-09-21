import type { Controllability, FailureCategory, StageKey } from './types';

export const STAGE_LABELS: Record<StageKey, string> = {
  application: 'Application',
  response: 'Recruiter Response',
  interview: 'Interview',
  technical_round: 'Technical Round',
  behavioral_round: 'Behavioral Round',
  final_round: 'Final Round',
  offer: 'Offer',
};

// Minimum sample size, at the "from" stage of a transition, before a conversion
// number is treated as a reliable signal rather than noise. Shared by the funnel
// engine and the pattern engine so the product speaks with one vocabulary about
// evidence strength everywhere it appears.
export const PATTERN_THRESHOLDS = {
  limited: 1, // 1 observation -> 'limited_evidence'
  emerging: 3, // 2-3 observations -> 'emerging_pattern'
  // 4+ observations -> 'repeated_pattern'
} as const;

export const FAILURE_CATEGORY_LABELS: Record<FailureCategory, string> = {
  TARGET_MISMATCH: 'Target Mismatch',
  APPLICATION_MISMATCH: 'Application Mismatch',
  ELIGIBILITY_MISMATCH: 'Eligibility Mismatch',
  TECHNICAL_PERFORMANCE: 'Technical Performance',
  COMMUNICATION_PERFORMANCE: 'Communication Performance',
  BEHAVIORAL_INTERVIEW: 'Behavioral Interview',
  PROJECT_EXPERIENCE_EVIDENCE: 'Project / Experience Evidence',
  INTERVIEW_PERFORMANCE: 'Interview Performance',
  ROLE_SPECIFIC_KNOWLEDGE: 'Role-Specific Knowledge',
  PREPARATION_GAP: 'Preparation Gap',
  OPPORTUNITY_FIT: 'Opportunity Fit',
  EXTERNAL_UNKNOWN: 'External / Unknown',
};

// Section 10 — separate what the student can influence from what they can't,
// so effort gets pointed somewhere it can actually change the next outcome.
export const CONTROLLABILITY: Record<FailureCategory, Controllability> = {
  TECHNICAL_PERFORMANCE: 'high',
  COMMUNICATION_PERFORMANCE: 'high',
  BEHAVIORAL_INTERVIEW: 'high',
  PROJECT_EXPERIENCE_EVIDENCE: 'high',
  INTERVIEW_PERFORMANCE: 'high',
  ROLE_SPECIFIC_KNOWLEDGE: 'high',
  PREPARATION_GAP: 'high',
  APPLICATION_MISMATCH: 'moderate',
  TARGET_MISMATCH: 'moderate',
  OPPORTUNITY_FIT: 'moderate',
  ELIGIBILITY_MISMATCH: 'moderate',
  EXTERNAL_UNKNOWN: 'low',
};

export const CONTROLLABILITY_COPY: Record<Controllability, string> = {
  high: 'Within your control',
  moderate: 'Partly within your control',
  low: 'Largely outside your control',
};

export const EMPTY_STATE_COPY = {
  noOutcomes: {
    title: 'No career outcomes recorded yet.',
    body: 'Once you complete an opportunity, ACEAPT will begin learning from the result.',
  },
  insufficientEvidence: {
    title: 'Not enough evidence yet.',
    body: 'Complete another relevant opportunity or add recruiter feedback to improve the analysis.',
  },
  unknownReason: {
    title: "We don't know yet.",
    body: 'Available evidence is insufficient to identify a specific reason.',
  },
} as const;

export const PATTERN_STRENGTH_COPY: Record<'limited_evidence' | 'emerging_pattern' | 'repeated_pattern' | 'none', string> = {
  none: 'No pattern to report',
  limited_evidence: 'Early signal — not enough evidence for a pattern',
  emerging_pattern: 'Emerging pattern',
  repeated_pattern: 'Repeated pattern',
};
