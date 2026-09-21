// Mirrors backend/src/types/strategy.ts's CommandCenterView and related
// types. Kept as a hand-written mirror (rather than a package import) since
// this module is meant to drop into ACEAPT's existing frontend build, which
// likely doesn't share a monorepo/package boundary with the backend yet.
// If/when it does, replace this file with a real shared-types import.

export type StrategyStatus = 'on_track' | 'needs_attention' | 'shift_recommended' | 'insufficient_data';
export type ValueTier = 'high' | 'medium' | 'low';
export type ConfidenceLevel = 'low' | 'medium' | 'high';

export type NextMoveKind =
  | 'apply_to_opportunity' | 'prepare_for_interview' | 'build_project' | 'improve_skill'
  | 'fix_resume_evidence' | 'practice_weak_area' | 'gather_information' | 'contact_mentor'
  | 'validate_opportunity' | 'stop_low_value_activity' | 'wait_and_monitor' | 'change_strategy';

export type NotNowReason = 'too_expensive' | 'too_time_consuming' | 'not_relevant' | 'wrong_timing' | 'need_information' | 'personal_reason';
export type FeedbackValue = 'helpful' | 'not_helpful' | 'already_done' | 'not_possible' | 'wrong_context';

export interface Bottleneck {
  category: string;
  description: string;
  whyItMatters: string;
  evidence: string[];
  severity: 'low' | 'medium' | 'high';
  whatHappensIfIgnored: string;
  recommendedAction: NextMoveKind;
  cascade?: { investigated: string[]; refinedCause?: string; unknowns: string[] };
  runnerUps: { category: string; score: number }[];
  detectedAt: string;
}

export interface NextBestMove {
  kind: NextMoveKind;
  title: string;
  tier: ValueTier;
  reasoning: string;
  dependency?: string;
  evidence: string[];
  alternatives: { kind: NextMoveKind; title: string; tier: ValueTier }[];
  requiresConfirmation: boolean;
  targetId?: string;
  blockedByConstraints: boolean;
}

export interface StrategyHealthDimension {
  status: 'good' | 'fair' | 'poor' | 'unknown';
  explanation: string;
}

export interface StrategyHealth {
  direction: StrategyHealthDimension;
  readiness: StrategyHealthDimension;
  evidence: StrategyHealthDimension;
  opportunity: StrategyHealthDimension;
  execution: StrategyHealthDimension;
  adaptation: StrategyHealthDimension;
  overallStatus: StrategyStatus;
  overallExplanation: string;
}

export interface Momentum {
  trend: 'improving' | 'stable' | 'declining' | 'unknown';
  drivers: string[];
}

export interface ConstraintCheckResult {
  ok: boolean;
  availableHoursPerWeek: number | null;
  plannedHoursPerWeek: number;
  violations: string[];
  overcommitted: boolean;
}

export interface DriftReport {
  driftDetected: boolean;
  overlapRatio: number | null;
  disconnectedActions: string[];
  explanation: string;
}

export interface Recommendation {
  id: string;
  summary: string;
  reason: string;
  confidence: ConfidenceLevel;
  evidence: string[];
  unknowns: string[];
  risks: string[];
  alternatives: string[];
  conditions: string[];
  strategyImpact: string;
  requiresConfirmation: boolean;
  generatedByLLM: boolean;
}

export interface CommandCenterView {
  currentPosition: string;
  target: string;
  strategyStatus: StrategyStatus;
  biggestGap: string;
  biggestOpportunity: string;
  biggestRisk: string;
  bottleneck: Bottleneck | null;
  nextBestMove: NextBestMove | null;
  strategyHealth: StrategyHealth;
  momentum: Momentum;
  focus: { title: string; tier: ValueTier }[];
  constraintCheck: ConstraintCheckResult;
  drift: DriftReport;
  dataSufficiency: 'ok' | 'low_data' | 'empty';
  recommendation: Recommendation | null;
  asOf: string;
}

export interface TimelineEntry {
  at: string;
  kind: 'strategy_created' | 'strategy_version' | 'decision' | 'action' | 'outcome' | 'experiment' | 'review' | 'recommendation';
  label: string;
  detail?: string;
}

export interface StrategyVersionSummary {
  targetRole: string;
  reason: string;
  versionNumber: number;
  createdAt: string;
}
