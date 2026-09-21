import { AlignmentResult, AlignmentSnapshot, TargetPriorityEntry, CohortTargetSummary } from '../src/types/align.types';

/**
 * Mock data shaped exactly like real API responses — the Data Analyst
 * numbers here are the actual output of the real engine from the golden
 * scenario walkthrough (scripts/demo-walkthrough.js), not invented for
 * the preview. Software Developer mirrors the critical-gap unit test
 * scenario (fit capped at 55 despite everything else being strong).
 */

export const DATA_ANALYST: AlignmentResult = {
  studentId: 'demo-anika',
  targetId: 'data_analyst',
  targetName: 'Data Analyst',
  calculatedAt: new Date().toISOString(),
  state: 'DEVELOPING_ALIGNMENT',
  fitScore: 84,
  readinessScore: 45,
  confidence: 'MEDIUM',
  strengths: [
    { capabilityId: 'quant_reasoning', capabilityName: 'Quantitative Reasoning', importance: 'CORE', level: 'STRONG' },
    { capabilityId: 'data_interpretation', capabilityName: 'Data Interpretation', importance: 'CORE', level: 'STRONG' },
    { capabilityId: 'logical_reasoning', capabilityName: 'Logical Reasoning', importance: 'IMPORTANT', level: 'STRONG' },
    { capabilityId: 'communication', capabilityName: 'Communication', importance: 'IMPORTANT', level: 'MEDIUM' },
    { capabilityId: 'programming', capabilityName: 'Programming', importance: 'SUPPORTING', level: 'MEDIUM' },
    { capabilityId: 'pattern_recognition', capabilityName: 'Pattern Recognition', importance: 'SUPPORTING', level: 'MEDIUM' },
  ],
  criticalGaps: [],
  supportingGaps: [
    {
      capabilityId: 'technical_fundamentals',
      capabilityName: 'Technical Fundamentals',
      importance: 'IMPORTANT',
      currentLevel: 'WEAK',
      requiredLevel: 'MEDIUM',
      deficit: 0.36,
      isCritical: false,
      confidence: 'MEDIUM',
    },
  ],
  nextBestAction: {
    capabilityId: 'technical_fundamentals',
    capabilityName: 'Technical Fundamentals',
    priorityScore: 0.19,
    rationale: ['Important requirement for this target', 'Currently weak, target expects medium'],
  },
  insufficientEvidenceCapabilities: [],
  insufficientEvidenceReason: null,
};

export const BUSINESS_ANALYST: AlignmentResult = {
  ...DATA_ANALYST,
  targetId: 'business_analyst',
  targetName: 'Business Analyst',
  fitScore: 78,
  readinessScore: 41,
  nextBestAction: {
    capabilityId: 'technical_fundamentals',
    capabilityName: 'Technical Fundamentals',
    priorityScore: 0.15,
    rationale: ['Supporting requirement for this target'],
  },
};

export const SOFTWARE_DEVELOPER: AlignmentResult = {
  studentId: 'demo-anika',
  targetId: 'software_developer',
  targetName: 'Software Developer',
  calculatedAt: new Date().toISOString(),
  state: 'DEVELOPING_ALIGNMENT',
  fitScore: 55,
  readinessScore: 38,
  confidence: 'HIGH',
  strengths: [
    { capabilityId: 'problem_solving', capabilityName: 'Problem Solving', importance: 'CORE', level: 'STRONG' },
    { capabilityId: 'communication', capabilityName: 'Communication', importance: 'IMPORTANT', level: 'STRONG' },
    { capabilityId: 'logical_reasoning', capabilityName: 'Logical Reasoning', importance: 'IMPORTANT', level: 'MEDIUM' },
  ],
  criticalGaps: [
    {
      capabilityId: 'programming',
      capabilityName: 'Programming',
      importance: 'CORE',
      currentLevel: 'WEAK',
      requiredLevel: 'STRONG',
      deficit: 0.56,
      isCritical: true,
      confidence: 'HIGH',
    },
  ],
  supportingGaps: [],
  nextBestAction: {
    capabilityId: 'programming',
    capabilityName: 'Programming',
    priorityScore: 0.84,
    rationale: ['Critical requirement for this target — currently capping your overall fit', 'Currently weak, target expects strong'],
  },
  insufficientEvidenceCapabilities: [],
  insufficientEvidenceReason: null,
};

export const AI_ML: AlignmentResult = {
  studentId: 'demo-anika',
  targetId: 'ai_ml',
  targetName: 'AI/ML',
  calculatedAt: new Date().toISOString(),
  state: 'INSUFFICIENT_EVIDENCE',
  fitScore: null,
  readinessScore: null,
  confidence: 'LOW',
  strengths: [],
  criticalGaps: [],
  supportingGaps: [],
  nextBestAction: null,
  insufficientEvidenceCapabilities: ['ml_fundamentals'],
  insufficientEvidenceReason:
    'No evidence yet for Machine Learning Fundamentals \u2014 a core requirement for this target.',
};

export const ALL_RESULTS = [DATA_ANALYST, BUSINESS_ANALYST, SOFTWARE_DEVELOPER, AI_ML];

export const SHORTLIST: TargetPriorityEntry[] = [
  { targetId: 'data_analyst', targetName: 'Data Analyst', rank: 1, tier: 'PRIMARY', fitScore: 84, readinessScore: 45, state: 'DEVELOPING_ALIGNMENT', reason: 'Fit 84% \u2014 led by Quantitative Reasoning' },
  { targetId: 'business_analyst', targetName: 'Business Analyst', rank: 2, tier: 'SECONDARY', fitScore: 78, readinessScore: 41, state: 'DEVELOPING_ALIGNMENT', reason: 'Fit 78% \u2014 led by Communication' },
  { targetId: 'software_developer', targetName: 'Software Developer', rank: 3, tier: 'STRETCH', fitScore: 55, readinessScore: 38, state: 'DEVELOPING_ALIGNMENT', reason: 'Fit 55% \u2014 blocked by Programming' },
];

export const AWAITING_EVIDENCE = [{ targetId: 'ai_ml', targetName: 'AI/ML' }];

export const HISTORY: AlignmentSnapshot[] = [
  { studentId: 'demo-anika', targetId: 'data_analyst', fitScore: 84, readinessScore: 42, state: 'DEVELOPING_ALIGNMENT', capturedAt: new Date(Date.now() - 86400000 * 3).toISOString() },
  { studentId: 'demo-anika', targetId: 'data_analyst', fitScore: 84, readinessScore: 45, state: 'DEVELOPING_ALIGNMENT', capturedAt: new Date().toISOString() },
];

export const COHORT: CohortTargetSummary[] = [
  { targetId: 'data_analyst', targetName: 'Data Analyst', counts: { STRONGLY_ALIGNED: 42, DEVELOPING_ALIGNMENT: 61, LOW_ALIGNMENT: 18, INSUFFICIENT_EVIDENCE: 9 } },
  { targetId: 'software_developer', targetName: 'Software Developer', counts: { STRONGLY_ALIGNED: 12, DEVELOPING_ALIGNMENT: 39, LOW_ALIGNMENT: 54, INSUFFICIENT_EVIDENCE: 15 } },
];

export const TOP_COHORT_GAPS = [
  { capabilityName: 'Programming', count: 61 },
  { capabilityName: 'Technical Fundamentals', count: 47 },
  { capabilityName: 'Communication', count: 22 },
];

export const EXPLANATION =
  'Your demonstrated capabilities currently show a 84% fit with Data Analyst, led by Quantitative Reasoning, Data Interpretation, and Logical Reasoning. Readiness sits at 45%, reflecting how much of that capability has been proof-verified so far. Technical Fundamentals still has room to grow.';
