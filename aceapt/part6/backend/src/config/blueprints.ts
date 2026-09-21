import { AssessmentBlueprint, AssessmentType } from '../domain/types';

/**
 * Blueprint configuration - section 8 of the spec.
 *
 * IMPORTANT: these are DATA, not hardcoded exam logic. Every downstream
 * service (selection, scoring, time analysis) reads shape/weights/duration
 * from here rather than assuming a fixed pattern, so a product owner can
 * retune an exam pattern by editing this file/config store - no code changes
 * required elsewhere. In a real deployment this would likely move to a DB
 * table so it's editable without a redeploy; the shape is identical either way.
 *
 * The realistic "mixed" topic distribution below mirrors the worked example
 * in the spec (Arithmetic 25 / Algebra 15 / Data 10 / Analytical 15 /
 * Patterns 10 / Grammar 10 / Comprehension 15 = 100%).
 */

const REALISTIC_MIX = [
  { topic: 'ARITHMETIC' as const, domain: 'QUANTITATIVE' as const, weightPct: 25 },
  { topic: 'ALGEBRA' as const, domain: 'QUANTITATIVE' as const, weightPct: 15 },
  { topic: 'DATA_INTERPRETATION' as const, domain: 'QUANTITATIVE' as const, weightPct: 10 },
  { topic: 'ANALYTICAL_REASONING' as const, domain: 'LOGICAL' as const, weightPct: 15 },
  { topic: 'PATTERNS_SERIES' as const, domain: 'LOGICAL' as const, weightPct: 10 },
  { topic: 'GRAMMAR' as const, domain: 'VERBAL' as const, weightPct: 10 },
  { topic: 'READING_COMPREHENSION' as const, domain: 'VERBAL' as const, weightPct: 15 },
];

const BROAD_EVEN_MIX = [
  { topic: 'ARITHMETIC' as const, domain: 'QUANTITATIVE' as const, weightPct: 15 },
  { topic: 'ALGEBRA' as const, domain: 'QUANTITATIVE' as const, weightPct: 14 },
  { topic: 'DATA_INTERPRETATION' as const, domain: 'QUANTITATIVE' as const, weightPct: 14 },
  { topic: 'ANALYTICAL_REASONING' as const, domain: 'LOGICAL' as const, weightPct: 14 },
  { topic: 'PATTERNS_SERIES' as const, domain: 'LOGICAL' as const, weightPct: 14 },
  { topic: 'GRAMMAR' as const, domain: 'VERBAL' as const, weightPct: 14 },
  { topic: 'READING_COMPREHENSION' as const, domain: 'VERBAL' as const, weightPct: 15 },
];

const DIAGNOSTIC_MIX = [
  { topic: 'ARITHMETIC' as const, domain: 'QUANTITATIVE' as const, weightPct: 18 },
  { topic: 'ALGEBRA' as const, domain: 'QUANTITATIVE' as const, weightPct: 12 },
  { topic: 'DATA_INTERPRETATION' as const, domain: 'QUANTITATIVE' as const, weightPct: 10 },
  { topic: 'ANALYTICAL_REASONING' as const, domain: 'LOGICAL' as const, weightPct: 15 },
  { topic: 'PATTERNS_SERIES' as const, domain: 'LOGICAL' as const, weightPct: 15 },
  { topic: 'GRAMMAR' as const, domain: 'VERBAL' as const, weightPct: 15 },
  { topic: 'READING_COMPREHENSION' as const, domain: 'VERBAL' as const, weightPct: 15 },
];

const SECTION_STRUCTURE = [
  { name: 'Quantitative', domains: ['QUANTITATIVE'] as const },
  { name: 'Logical', domains: ['LOGICAL'] as const },
  { name: 'Verbal', domains: ['VERBAL'] as const },
];

export const BLUEPRINTS: Record<AssessmentType, AssessmentBlueprint> = {
  DIAGNOSTIC_ASSESSMENT: {
    id: 'bp_diagnostic_v1',
    type: 'DIAGNOSTIC_ASSESSMENT',
    label: 'Diagnostic Assessment',
    purpose:
      'Establish a safe, broad baseline across every domain when little or no assessment history exists yet.',
    questionCount: 20,
    durationSeconds: 25 * 60,
    topicWeights: DIAGNOSTIC_MIX,
    difficultyDistribution: { EASY: 0.35, MEDIUM: 0.4, MEDIUM_PLUS: 0.2, HARD: 0.05 },
    scoringRule: 'EQUAL_WEIGHT',
  },

  PROGRESS_ASSESSMENT: {
    id: 'bp_progress_v1',
    type: 'PROGRESS_ASSESSMENT',
    label: 'Progress Assessment',
    purpose:
      'Check whether recently targeted weak skills have genuinely improved, with light coverage of everything else.',
    questionCount: 12,
    durationSeconds: 15 * 60,
    topicWeights: BROAD_EVEN_MIX, // overridden toward focusTopics by blueprintService when provided
    difficultyDistribution: { EASY: 0.15, MEDIUM: 0.45, MEDIUM_PLUS: 0.3, HARD: 0.1 },
    scoringRule: 'EQUAL_WEIGHT',
  },

  MASTERY_ASSESSMENT: {
    id: 'bp_mastery_v1',
    type: 'MASTERY_ASSESSMENT',
    label: 'Mastery Assessment',
    purpose: 'Verify deep mastery of one or two specific topics with a harder difficulty skew.',
    questionCount: 15,
    durationSeconds: 20 * 60,
    topicWeights: BROAD_EVEN_MIX, // overridden toward focusTopics by blueprintService when provided
    difficultyDistribution: { EASY: 0.05, MEDIUM: 0.25, MEDIUM_PLUS: 0.4, HARD: 0.3 },
    scoringRule: 'DIFFICULTY_WEIGHTED',
    focusTopics: ['ARITHMETIC'],
  },

  MIXED_APTITUDE_ASSESSMENT: {
    id: 'bp_mixed_v1',
    type: 'MIXED_APTITUDE_ASSESSMENT',
    label: 'Mixed Aptitude Assessment',
    purpose: 'General realistic mixed-topic practice exam resembling an actual placement aptitude test.',
    questionCount: 30,
    durationSeconds: 35 * 60,
    topicWeights: REALISTIC_MIX,
    difficultyDistribution: { EASY: 0.2, MEDIUM: 0.4, MEDIUM_PLUS: 0.28, HARD: 0.12 },
    scoringRule: 'EQUAL_WEIGHT',
  },

  TIMED_ASSESSMENT: {
    id: 'bp_timed_v1',
    type: 'TIMED_ASSESSMENT',
    label: 'Timed Assessment',
    purpose: 'Deliberately tight time budget to stress-test time management specifically, independent of difficulty.',
    questionCount: 20,
    durationSeconds: 1000, // ~50s/question vs ~70s/question implied by the mixed exam - genuinely tighter
    topicWeights: REALISTIC_MIX,
    difficultyDistribution: { EASY: 0.25, MEDIUM: 0.4, MEDIUM_PLUS: 0.25, HARD: 0.1 },
    scoringRule: 'EQUAL_WEIGHT',
  },

  FULL_MOCK_ASSESSMENT: {
    id: 'bp_full_mock_v1',
    type: 'FULL_MOCK_ASSESSMENT',
    label: 'Full Mock Assessment',
    purpose: 'Longest, full-length realistic simulation of an actual aptitude placement test with section structure.',
    questionCount: 50,
    durationSeconds: 60 * 60,
    topicWeights: REALISTIC_MIX,
    difficultyDistribution: { EASY: 0.2, MEDIUM: 0.35, MEDIUM_PLUS: 0.3, HARD: 0.15 },
    sections: SECTION_STRUCTURE as any,
    scoringRule: 'DIFFICULTY_WEIGHTED',
  },

  READINESS_ASSESSMENT: {
    id: 'bp_readiness_v1',
    type: 'READINESS_ASSESSMENT',
    label: 'Readiness Assessment',
    purpose: 'Broad, moderately-hard assessment built specifically to produce high-quality readiness evidence.',
    questionCount: 25,
    durationSeconds: 30 * 60,
    topicWeights: REALISTIC_MIX,
    difficultyDistribution: { EASY: 0.15, MEDIUM: 0.35, MEDIUM_PLUS: 0.32, HARD: 0.18 },
    scoringRule: 'DIFFICULTY_WEIGHTED',
  },

  FINAL_READINESS_CHECK: {
    id: 'bp_final_check_v1',
    type: 'FINAL_READINESS_CHECK',
    label: 'Final Readiness Check',
    purpose: 'Last checkpoint before the real exam - closest to full-mock conditions, requires prior evidence to be meaningful.',
    questionCount: 30,
    durationSeconds: 40 * 60,
    topicWeights: REALISTIC_MIX,
    difficultyDistribution: { EASY: 0.12, MEDIUM: 0.33, MEDIUM_PLUS: 0.35, HARD: 0.2 },
    sections: SECTION_STRUCTURE as any,
    scoringRule: 'DIFFICULTY_WEIGHTED',
    minPriorAssessmentsRequired: 2,
  },
};

export function getBlueprint(type: AssessmentType): AssessmentBlueprint {
  const bp = BLUEPRINTS[type];
  if (!bp) throw new Error(`No blueprint configured for assessment type: ${type}`);
  return bp;
}
