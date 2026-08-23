/**
 * PrepVista AI — Part 15
 * Shared type definitions for the Placement Forecasting + Strategy Engine.
 *
 * INTEGRATION NOTE: These types describe the *shape* Part 15 needs. If Parts 1-14
 * already define overlapping domain types (Student, Department, Company, Drive...),
 * prefer mapping those into the shapes below at the repository boundary
 * (see repository/PlacementDataRepository.ts) rather than duplicating entities.
 */

// ─────────────────────────────────────────────────────────────────────────
// RBAC — Section 1 / 5 / 6: exactly three roles. No recruiter role exists.
// ─────────────────────────────────────────────────────────────────────────

export const ROLES = ["TPO", "MANAGEMENT", "STUDENT"] as const;
export type Role = (typeof ROLES)[number];

export interface CallerContext {
  role: Role;
  userId: string;
  institutionId: string;
  /** Required and enforced when role === "STUDENT". Ignored otherwise. */
  studentId?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Core domain primitives
// ─────────────────────────────────────────────────────────────────────────

export interface Department {
  id: string;
  name: string;
  totalStudents: number;
}

export interface SeasonSummary {
  seasonId: string;
  label: string;
  /** Fraction of the season elapsed at the comparability checkpoint used below, 0-1. */
  fractionElapsedAtSnapshot: number;
  /** Placement % observed at that checkpoint — used by the baseline "historical uplift" forecast method. */
  placementPctAtComparableCheckpoint: number;
  finalPlacementPct: number | null; // null if season still in progress
  totalStudents: number;
  verifiedPlacements: number;
  placementDefinitionVersion: string;
  readinessModelVersion: string;
}

export type EngagementStatus =
  | "OFFER_ACCEPTED_AWAITING_JOIN"
  | "IN_INTERVIEW_STAGE"
  | "APPLIED_AWAITING_INTERVIEW"
  | "NO_ACTIVE_APPLICATION";

export interface RemainingPoolBucket {
  status: EngagementStatus;
  count: number;
  /** Historically observed eventual "reach verified placement by season end" rate for this bucket. */
  historicalEventualJoinRate: number;
}

export interface FunnelStageRates {
  applicationConversion: number; // applied -> interviewed
  interviewConversion: number; // interviewed -> offered
  offerAcceptanceConversion: number; // offered -> accepted
  joiningConversion: number; // accepted -> verified joined
  sampleSize: number;
}

export interface CurrentSeasonSnapshot {
  seasonId: string;
  asOf: string; // ISO date — the data cutoff. Nothing after this may be used.
  fractionElapsed: number;
  totalEligibleStudents: number;
  verifiedPlacements: number;
  remainingPool: RemainingPoolBucket[];
  institutionFunnelRates: FunnelStageRates;
  freshnessStatus: "LIVE" | "DELAYED";
  dataQualityFlags: string[]; // e.g. "3 joining records missing confirmation date"
}

export interface DepartmentSeasonState {
  departmentId: string;
  seasonId: string;
  totalStudents: number;
  verifiedPlacements: number;
  funnelRates: FunnelStageRates;
  /** Same engagement-status partition as CurrentSeasonSnapshot.remainingPool, scoped to this department. */
  remainingPool: RemainingPoolBucket[];
  // NOTE: the institutional median/benchmark for comparison is intentionally NOT stored
  // here — it's computed centrally (see RecommendationEngine) from the full set of
  // department states so it can exclude small-sample departments from skewing it.
}

export interface Student {
  id: string;
  departmentId: string;
  readinessScore: number; // 0-100
  skillTags: string[];
  status: "PLACED" | "OFFER_ACCEPTED" | "IN_PROCESS" | "NOT_ENGAGED";
}

export interface Company {
  id: string;
  name: string;
  industry: string;
  historicalHiresBySeason: Record<string, number>;
  lastActiveSeasonId: string | null;
  relationshipStrength: number; // 0-1, e.g. derived from responsiveness/repeat engagement
}

export interface Drive {
  id: string;
  companyId: string;
  seasonId: string;
  status: "OPEN" | "CLOSED";
  eligibleDepartmentIds: string[];
  requiredSkills: string[];
  roleCategory: string;
  seats: number;
}

// ─────────────────────────────────────────────────────────────────────────
// Targets — Section 12/13
// ─────────────────────────────────────────────────────────────────────────

export type TargetMetric =
  | "PLACEMENT_PCT"
  | "OFFERS"
  | "JOINING"
  | "COMPANIES"
  | "MEDIAN_CTC"
  | "READINESS";

export interface PlacementTarget {
  id: string;
  institutionId: string;
  seasonId: string;
  metric: TargetMetric;
  targetValue: number;
  targetDate: string;
  scope: "INSTITUTION" | { departmentId: string };
  createdBy: string;
  version: number;
  status: "ACTIVE" | "SUPERSEDED" | "ARCHIVED";
}

// ─────────────────────────────────────────────────────────────────────────
// Forecasts — Section 10/11/15-26
// ─────────────────────────────────────────────────────────────────────────

export type ConfidenceLevel = "LOW" | "MEDIUM" | "HIGH";

export interface ForecastRange {
  low: number;
  high: number;
}

/** Every forecast must carry this envelope — Section 10. Never a bare number. */
export interface ForecastEnvelope {
  dataAvailable: boolean;
  reason?: string; // populated when dataAvailable === false, e.g. "insufficient_sample"
  pointEstimate?: number;
  range?: ForecastRange;
  confidence?: ConfidenceLevel;
  forecastHorizon?: string; // e.g. "season end (2026-05-31)"
  generatedAt: string; // ISO timestamp
  modelVersion: string;
  inputWindow: string; // description of data used, e.g. "seasons 2022-2025 + current season through asOf"
  dataThrough: string; // the asOf cutoff actually used
  freshness: "LIVE" | "DELAYED";
  sampleSize?: number;
  limitations: string[];
  method: "BASELINE_HISTORICAL_UPLIFT" | "PIPELINE_WEIGHTED_PROJECTION" | "BLENDED";
}

export interface DepartmentForecast extends ForecastEnvelope {
  departmentId: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Target Gap — Section 13/14
// ─────────────────────────────────────────────────────────────────────────

export interface TargetGapSummary {
  target: number;
  current: number;
  gapPoints: number;
  requiredAdditionalPlacements: number;
  totalEligibleStudents: number;
  asOf: string;
}

export interface StageContribution {
  stage: "APPLICATION_CONVERSION" | "INTERVIEW_CONVERSION" | "OFFER_ACCEPTANCE" | "JOINING_CONVERSION";
  observedRate: number;
  benchmarkRate: number;
  /** Estimated students "left behind" at this stage relative to the benchmark, holding other stages at their actual observed rate. */
  observedContributionStudents: number;
  affectedStudents: number;
  label: "Observed contribution area"; // never phrased as causal
}

export interface TargetGapExplanation {
  gapSummary: TargetGapSummary;
  stageContributions: StageContribution[];
  /**
   * Because stage contributions are computed via one-at-a-time sensitivity
   * (holding other stages at actual rates), they will not exactly sum to the
   * total gap when rates interact. That interaction/estimation error is
   * surfaced explicitly here rather than hidden or silently redistributed.
   */
  unattributedResidualStudents: number;
  note: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Scenarios — Section 37-40
// ─────────────────────────────────────────────────────────────────────────

export interface ScenarioInput {
  label: string;
  applicationConversionDelta?: number; // absolute percentage-point delta
  interviewConversionDelta?: number;
  offerAcceptanceDelta?: number;
  joiningConversionDelta?: number;
  additionalDrives?: number; // coarse: extra ready-student matches assumed from new drives
}

export interface ScenarioResult {
  type: "scenario_estimate"; // never presented as a guarantee
  label: string;
  assumptions: ScenarioInput;
  baselinePointEstimate: number;
  projectedRange: ForecastRange;
  deltaFromBaseline: ForecastRange;
  confidence: ConfidenceLevel;
  generatedAt: string;
  caveat: string;
}

export interface ScenarioComparison {
  current: { pointEstimate: number; range: ForecastRange };
  scenarios: ScenarioResult[];
}

// ─────────────────────────────────────────────────────────────────────────
// Strategic gaps + recommendations — Section 35/41/42
// ─────────────────────────────────────────────────────────────────────────

export type StrategicGapType =
  | "STUDENT_GAP"
  | "OPPORTUNITY_GAP"
  | "SKILL_GAP"
  | "FUNNEL_GAP"
  | "JOINING_GAP"
  | "DATA_GAP";

export interface StrategicGap {
  type: StrategicGapType;
  description: string;
  evidence: string[];
  affectedStudents: number;
}

export interface StrategicRecommendation {
  id: string;
  issue: string;
  evidence: string[];
  affectedStudents: number;
  potentialImpact: string; // qualitative + quantitative where justified, never a bare unsupported %
  effortEstimate: "LOW" | "MEDIUM" | "HIGH" | "UNKNOWN";
  urgency: number; // 0-1
  impact: number; // 0-1
  feasibility: number; // 0-1
  confidence: number; // 0-1
  priorityScore: number; // impact * urgency * feasibility * confidence
  actionOwner: Role;
  explanation: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Opportunity intelligence — Section 28-34, 70
// ─────────────────────────────────────────────────────────────────────────

export interface OpportunityCoverage {
  readyStudents: number;
  matchedToActiveOpportunity: number;
  unmatched: number;
  unmatchedStudentIds: string[];
  asOf: string;
}

export interface SkillDemandSupply {
  skill: string;
  activeRoleDemand: number;
  studentsMeetingThreshold: number;
  gap: number; // demand - supply, can be negative (surplus)
}

export interface RoleCoverage {
  roleCategory: string;
  opportunityCount: number;
  studentReadyCount: number;
  coverageRatio: number;
  gap: number;
}

export interface CompanyConcentration {
  topNCompanies: { companyId: string; name: string; offerShare: number }[];
  topNShareOfTotalOffers: number;
  n: number;
  totalActiveCompanies: number;
  note: string; // neutral phrasing — never automatically "bad"
}

export interface IndustryConcentration {
  industry: string;
  offerSharePct: number;
  joiningSharePct: number;
  studentInterestScore: number | null;
}

export interface OutreachPriorityScoreComponents {
  pastHiring: number;
  relationshipStrength: number;
  studentSkillMatch: number;
  departmentDemand: number;
  recency: number;
  opportunityGap: number;
}

export interface OutreachPriority {
  companyId: string;
  companyName: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  score: number;
  components: OutreachPriorityScoreComponents;
  evidence: string[];
  disclaimer: string; // "This is a recommendation, not a fact about future hiring intent."
}

// ─────────────────────────────────────────────────────────────────────────
// Forecast performance / monitoring — Section 23/24/56
// ─────────────────────────────────────────────────────────────────────────

export interface ForecastPerformanceRecord {
  forecastId: string;
  metric: TargetMetric;
  scope: "INSTITUTION" | string; // departmentId when scoped
  forecastedAt: string;
  forecastPointEstimate: number;
  forecastRange: ForecastRange;
  modelVersion: string;
  actualValue: number;
  actualObservedAt: string;
  absoluteError: number;
  withinRange: boolean;
}

// ─────────────────────────────────────────────────────────────────────────
// Events — Section 53
// ─────────────────────────────────────────────────────────────────────────

export const STRATEGY_EVENTS = [
  "FORECAST_CREATED",
  "FORECAST_UPDATED",
  "FORECAST_ERROR_DETECTED",
  "TARGET_GAP_DETECTED",
  "SCENARIO_CREATED",
  "SCENARIO_RUN",
  "SCENARIO_ARCHIVED",
  "STRATEGIC_GAP_DETECTED",
  "STRATEGIC_RECOMMENDATION_CREATED",
  "STRATEGIC_ACTION_CREATED",
  "STRATEGIC_ACTION_COMPLETED",
  "OPPORTUNITY_COVERAGE_UPDATED",
  "COMPANY_CONCENTRATION_UPDATED",
] as const;
export type StrategyEventName = (typeof STRATEGY_EVENTS)[number];

// ─────────────────────────────────────────────────────────────────────────
// Audit — Section 54
// ─────────────────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string;
  timestamp: string;
  actorId: string;
  actorRole: Role;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────────────────
// AI tool surface — Section 48-52
// ─────────────────────────────────────────────────────────────────────────

/**
 * Shape every Part 12 AI tool follows. `handler` returns the service's raw
 * output verbatim — Section 49 ("AI must not invent forecasts") is enforced
 * by giving the LLM nothing to embellish: if a forecast isn't available, the
 * handler returns `{ dataAvailable: false, reason: ... }` and Part 12 must
 * surface that honestly rather than substituting a guess.
 */
export interface ToolDefinition<TArgs = any, TResult = any> {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON-schema-shaped, framework-agnostic
  requiresRole: Role[]; // documents the enforced boundary; handler also asserts it
  handler: (args: TArgs, caller: CallerContext) => Promise<TResult>;
}

// ─────────────────────────────────────────────────────────────────────────
// Student-safe personal outlook — Section 5/52
// ─────────────────────────────────────────────────────────────────────────

/**
 * Whitelist type: this is the ONLY shape student-facing code may return.
 * If a field isn't here, it must never reach a student caller.
 */
export interface PersonalOutlook {
  readinessTrend: "IMPROVING" | "STEADY" | "DECLINING";
  readinessScore: number;
  eligibleActiveOpportunities: number;
  recommendedTraining: string[];
  message: string;
}
