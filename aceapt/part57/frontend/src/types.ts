export type TrustState = 'EXPERIMENTAL' | 'DEVELOPING' | 'RELIABLE' | 'TRUSTED' | 'NEEDS_REVIEW';
export type SessionMode = 'LEARNING' | 'PRACTICE' | 'TIMED_TRAINING' | 'FORMAL_ASSESSMENT';
export type ApplicabilityResult = 'APPLICABLE' | 'CONDITIONALLY_APPLICABLE' | 'NOT_APPLICABLE' | 'UNKNOWN';
export type TrainingActivityType = 'RECALL' | 'SELECTION' | 'APPLICATION' | 'VERIFICATION' | 'TRANSFER' | 'PRESSURE' | 'RETENTION';

export const STRATEGY_TYPES = [
  'MENTAL_MATH',
  'PERCENTAGE_TRICK',
  'RATIO_METHOD',
  'AVERAGE_METHOD',
  'ESTIMATION',
  'ELIMINATION',
  'BACKSOLVING',
  'OPTION_TESTING',
  'PATTERN_RECOGNITION',
  'REPRESENTATION_CHANGE',
  'CASE_REDUCTION',
  'ALGEBRAIC_TRANSFORMATION',
  'FORMULA_REARRANGEMENT',
  'COMMON_FACTOR',
  'SYMMETRY',
  'PAIRING',
  'COMPLEMENT_METHOD',
  'APPROXIMATION',
  'COUNTING_REDUCTION',
  'LOGICAL_SHORTCUT',
  'PERSONAL_METHOD',
] as const;

export interface ConditionRule {
  field: string;
  op: string;
  value?: unknown;
  label?: string;
}

export interface ShortcutSummary {
  shortcutId: string;
  canonicalName: string;
  category: string;
  domain: string;
  strategyType: string;
  classification: string;
  status: string;
  isPersonal: boolean;
  trustState: TrustState;
  reliability: number;
  usageCount: number;
  avgTimeSavedRatio: number | null;
  pinned: boolean;
  createdAt: string;
}

export interface MyShortcuts {
  trusted: ShortcutSummary[];
  developing: ShortcutSummary[];
  needsReview: ShortcutSummary[];
  recentlyAdded: ShortcutSummary[];
  recommended: ShortcutSummary[];
  todaysFocus: TrainingActivityType | null;
}

export interface PerformanceSummary {
  usageCount: number;
  successCount: number;
  reliability: number;
  avgTimeSavedRatio: number | null;
  medianResponseTimeMs: number | null;
  medianBaselineTimeMs: number | null;
  state: string;
  byDifficulty: Record<string, { count: number; accuracy: number }>;
  byNovelty: Record<string, { count: number; accuracy: number }>;
}

export interface ShortcutDetail extends ShortcutSummary {
  description: string;
  skillId: string | null;
  formulaId: string | null;
  questionFamilyId: string | null;
  requiresOptions: boolean;
  isApproximation: boolean;
  acceptableError: number | null;
  version: number;
  steps: string[];
  conditions: ConditionRule[];
  nonApplicability: ConditionRule[];
  whenToUseText: string;
  whenNotToUseText: string;
  underlyingReason: string;
  expression: string | null;
  canonicalExpression: string | null;
  examples: Array<{ id: string; isCounterexample: boolean; input: Record<string, number>; expectedOutput: number | null; note: string }>;
  latestValidation: { status: string; validationType: string; validatedAt: string } | null;
  performance: PerformanceSummary | null;
  notes: string;
  preferred: boolean;
}

export interface ValidateResult {
  overallStatus: 'PASS' | 'FAIL' | 'INCONCLUSIVE';
  propertyTest?: { status: string; samplesTested: number; failures: unknown[] };
  exampleResults: Array<{ exampleId: string; isCounterexample: boolean; passed: boolean; expected: number | null; actual: number | null }>;
}

export interface Discovery {
  id: string;
  candidate_strategy_type: string;
  question_family_id: string | null;
  method_signature: string;
  evidence: string;
  confidence: number;
  status: string;
  created_at: string;
}

export interface RankedRecommendation {
  shortcutId: string;
  canonicalName: string;
  applicability: ApplicabilityResult;
  trustState: TrustState;
  reliability: number;
  rationale: string;
}

export interface RecommendationOutcome {
  allowed: boolean;
  reason?: string;
  recommended: RankedRecommendation | null;
  alternatives: RankedRecommendation[];
}

export interface TrainingPrompt {
  activityType: TrainingActivityType;
  shortcutId: string | null;
  promptRef: string;
  prompt: {
    instructions?: string;
    showShortcut?: boolean;
    options?: string[];
    correctOption?: string;
    example?: { id: string; isCounterexample: boolean; input: Record<string, number>; expectedOutput: number | null; note: string } | null;
    expectedAnswer?: string;
    timeLimitSeconds?: number;
  };
}
