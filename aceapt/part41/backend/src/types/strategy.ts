import type { ID, PriorityWeights, Goal, Skill, Evidence, Opportunity, ApplicationRecord, DecisionRecord, OutcomeRecord, ConstraintRecord } from './domain.js';

export type StrategyStatus = 'on_track' | 'needs_attention' | 'shift_recommended' | 'insufficient_data';
export type ValueTier = 'high' | 'medium' | 'low';
export type ConfidenceLevel = 'low' | 'medium' | 'high';

// ---------------------------------------------------------------------------
// Strategy + versioning (spec #17-20, #59)
// ---------------------------------------------------------------------------

export interface CareerStrategy {
  id: ID;
  studentId: ID;
  currentVersionId: ID | null;
  status: StrategyStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StrategyVersion {
  id: ID;
  strategyId: ID;
  versionNumber: number;
  goalId: ID | null;
  targetRole: string;
  reason: string;
  assumptions: string[];
  priorities: PriorityWeights;
  createdAt: string;
  supersededAt?: string;
}

// ---------------------------------------------------------------------------
// Signals (spec #54)
// ---------------------------------------------------------------------------

export type SignalType =
  | 'progress' | 'gap' | 'risk' | 'opportunity' | 'trend'
  | 'bottleneck' | 'decision' | 'uncertainty' | 'constraint';

export interface StrategySignal {
  id: ID;
  type: SignalType;
  code: string;
  detail: string;
  /** 0..1 corroboration strength. Used to gate whether a signal is strong
   * enough on its own, or needs to combine with others, before it can
   * justify flagging a bottleneck (spec #8: "require supporting evidence"). */
  weight: number;
  payload?: Record<string, unknown>;
  detectedAt: string;
}

// ---------------------------------------------------------------------------
// Bottleneck (spec #8-10)
// ---------------------------------------------------------------------------

export type BottleneckCategory =
  | 'insufficient_technical_evidence'
  | 'poor_interview_performance'
  | 'weak_communication'
  | 'insufficient_project_depth'
  | 'poor_positioning'
  | 'inadequate_opportunity_targeting'
  | 'inconsistent_execution'
  | 'missing_experience'
  | 'unclear_career_direction'
  | 'insufficient_application_volume'
  | 'weak_preparation'
  | 'lack_of_portfolio_evidence';

export interface BottleneckCandidateScore {
  category: BottleneckCategory;
  score: number;
  corroboratingSignals: string[]; // signal codes
}

export interface Bottleneck {
  category: BottleneckCategory;
  description: string;
  whyItMatters: string;
  evidence: string[];
  severity: 'low' | 'medium' | 'high';
  whatHappensIfIgnored: string;
  recommendedAction: NextMoveKind;
  /** Cascade investigation (spec #10) — only populated for bottlenecks that
   * define sub-causes, e.g. poor_interview_performance. */
  cascade?: { investigated: string[]; refinedCause?: string; unknowns: string[] };
  runnerUps: BottleneckCandidateScore[];
  detectedAt: string;
}

// ---------------------------------------------------------------------------
// Next Best Move / action value model (spec #6-7, #47-49)
// ---------------------------------------------------------------------------

export type NextMoveKind =
  | 'apply_to_opportunity' | 'prepare_for_interview' | 'build_project' | 'improve_skill'
  | 'fix_resume_evidence' | 'practice_weak_area' | 'gather_information' | 'contact_mentor'
  | 'validate_opportunity' | 'stop_low_value_activity' | 'wait_and_monitor' | 'change_strategy';

export interface ValueFactors {
  impact: number;
  relevance: number;
  confidence: number;
  urgency: number;
  effort: number;
  risk: number;
  opportunityCost: number;
}

export interface NextMoveCandidateScore {
  kind: NextMoveKind;
  title: string;
  applicable: boolean;
  factors: ValueFactors;
  rawScore: number; // internal only — never shown to the user as-is
  tier: ValueTier;
  reasoning: string;
  evidence: string[];
  violatesConstraints: boolean;
  targetId?: ID; // e.g. which opportunity/skill this candidate refers to
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
  targetId?: ID;
  blockedByConstraints: boolean;
}

// ---------------------------------------------------------------------------
// Strategy health + momentum (spec #11-16)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Constraints, drift, contradiction (spec #34-39)
// ---------------------------------------------------------------------------

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

export interface ContradictionFlag {
  detected: boolean;
  priority: keyof PriorityWeights | null;
  decisionSummary: string;
  question: string;
}

// ---------------------------------------------------------------------------
// Actions, experiments, recommendations, reviews (spec #28-30, #47-51, #24)
// ---------------------------------------------------------------------------

export type ActionStatus = 'suggested' | 'accepted' | 'not_now' | 'in_progress' | 'completed' | 'skipped';
export type NotNowReason = 'too_expensive' | 'too_time_consuming' | 'not_relevant' | 'wrong_timing' | 'need_information' | 'personal_reason';

export interface StrategyAction {
  id: ID;
  strategyId: ID;
  kind: NextMoveKind;
  title: string;
  status: ActionStatus;
  valueTier: ValueTier;
  reasoning: string;
  notNowReason?: NotNowReason;
  targetId?: ID;
  createdAt: string;
  completedAt?: string;
}

export type ExperimentStatus = 'planned' | 'running' | 'completed' | 'inconclusive' | 'invalidated' | 'supported';

export interface CareerExperiment {
  id: ID;
  strategyId: ID;
  hypothesis: string;
  action: string;
  expectedOutcome: string;
  measurement: string;
  timeWindowDays: number;
  status: ExperimentStatus;
  actualOutcome?: string;
  conclusion?: string;
  startedAt?: string;
  endsAt?: string;
  createdAt: string;
}

export type FeedbackValue = 'helpful' | 'not_helpful' | 'already_done' | 'not_possible' | 'wrong_context';

export interface Recommendation {
  id: ID;
  strategyId: ID;
  type: 'next_best_move' | 'strategy_review' | 'strategy_change';
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
  createdAt: string;
  /** true if a real LLM call produced the narrative; false if the
   * deterministic-template fallback was used (spec #58, #72 fallback_rate). */
  generatedByLLM: boolean;
}

export interface StrategyReview {
  id: ID;
  strategyId: ID;
  periodStart: string;
  periodEnd: string;
  progress: string;
  decisions: string[];
  actions: string[];
  outcomes: string[];
  blockers: string[];
  newOpportunities: string[];
  lessons: string[];
  nextPriority: string;
  createdAt: string;
}

export interface TimelineEntry {
  at: string;
  kind: 'strategy_created' | 'strategy_version' | 'decision' | 'action' | 'outcome' | 'experiment' | 'review' | 'recommendation';
  label: string;
  detail?: string;
}

// ---------------------------------------------------------------------------
// The assembled, allowlisted context object (spec #52-53) — the ONLY thing
// that is allowed to reach the AI layer or the engines. Never pass raw DB
// rows or unrelated student data into this.
// ---------------------------------------------------------------------------

export interface StrategyContext {
  studentId: ID;
  goal: Goal | null;
  skills: Skill[];
  evidence: Evidence[];
  opportunities: Opportunity[];
  applications: ApplicationRecord[];
  recentDecisions: DecisionRecord[];
  recentOutcomes: OutcomeRecord[];
  constraints: ConstraintRecord[];
  currentStrategy: CareerStrategy | null;
  currentVersion: StrategyVersion | null;
  recentActions: StrategyAction[];
  priorities: PriorityWeights;
  asOf: string;
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
  focus: { title: string; tier: ValueTier }[]; // max 3 (spec #41)
  constraintCheck: ConstraintCheckResult;
  drift: DriftReport;
  dataSufficiency: 'ok' | 'low_data' | 'empty';
  recommendation: Recommendation | null;
  asOf: string;
}
