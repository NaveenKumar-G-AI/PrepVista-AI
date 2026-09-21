/**
 * Core domain types for Feature 10.
 * Section markers (SSxx) map back to the ACEAPT Feature 10 master prompt
 * so this file can be audited line-by-line against the spec.
 */

export type TrajectoryState =
  | 'UPWARD'
  | 'STABLE'
  | 'SLOWING'
  | 'REGRESSING'
  | 'UNSTABLE'
  | 'INSUFFICIENT_EVIDENCE'; // SS9

export type MomentumState =
  | 'ACCELERATING'
  | 'STABLE'
  | 'SLOWING'
  | 'REVERSING'
  | 'INSUFFICIENT_EVIDENCE'; // SS11

export type VolatilityState =
  | 'STABLE'
  | 'MODERATELY_VARIABLE'
  | 'HIGHLY_VARIABLE'
  | 'INSUFFICIENT_EVIDENCE'; // SS22

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT_EVIDENCE'; // SS14, SS36

export type TargetStatus = 'ON_TRACK' | 'AT_RISK' | 'BEHIND' | 'INSUFFICIENT_EVIDENCE'; // SS16

export type RiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH'; // SS20

export type RiskStatus = 'ACTIVE' | 'IMPROVING' | 'RESOLVED' | 'INSUFFICIENT_EVIDENCE'; // SS20

export type InterventionResponse =
  | 'HIGH_RESPONSE'
  | 'MODERATE_RESPONSE'
  | 'LOW_RESPONSE'
  | 'NO_RESPONSE'
  | 'INSUFFICIENT_EVIDENCE'; // SS25

export type EvidenceStrength = 'POSSIBLE_CONTRIBUTOR' | 'SUPPORTED_PATTERN'; // SS12, SS19

export interface TrajectoryPoint {
  id?: string;
  studentId: string;
  metric: string; // e.g. "readiness", "time_management", "data_interpretation"
  value: number;
  timestamp: string; // ISO date
}

export interface SkillTrajectoryResult {
  metric: string;
  state: TrajectoryState;
  slopePerWeek: number | null;
  volatility: VolatilityState;
  pointsUsed: number;
  window: { start: string; end: string } | null;
}

export interface MomentumResult {
  metric: string;
  state: MomentumState;
  detail: string;
}

export interface RegressionResult {
  metric: string;
  detected: boolean;
  cumulativeDrop: number | null;
  consecutiveDeclines: number;
  possibleContributors: { factor: string; strength: EvidenceStrength }[];
}

export interface FalseMasterySignal {
  skill: string;
  practiceScore: number;
  transferScore: number | null;
  simulationScore: number | null;
  gap: number;
  detected: boolean;
  message: string;
}

export interface ConfidenceResult {
  level: ConfidenceLevel;
  score: number | null; // normalized 0-1, null if INSUFFICIENT_EVIDENCE
  inputs: {
    evidenceCount: number;
    recencyScore: number;
    consistencyScore: number;
    diversityScore: number;
  };
}

export interface BottleneckCandidate {
  skill: string;
  weaknessSeverity: number; // 0-100, higher = weaker
  simulationTimeCostRatio: number; // observed/allocated
  downstreamAccuracyEffect: number; // 0-1 proxy
  impactScore: number;
}

export interface BottleneckChainStep {
  description: string;
  strength: EvidenceStrength;
}

export interface BottleneckResult {
  primary: BottleneckCandidate | null;
  secondary: BottleneckCandidate | null;
  ranked: BottleneckCandidate[];
  chain: BottleneckChainStep[];
}

export interface RiskSignal {
  id?: string;
  studentId: string;
  type: string; // e.g. TIME_MANAGEMENT_RISK
  severity: RiskSeverity;
  confidence: number; // 0-1
  evidence: Record<string, unknown>;
  status: RiskStatus;
  firstDetected: string;
  lastUpdated: string;
}

export interface InterventionOutcome {
  id?: string;
  studentId: string;
  interventionId: string;
  interventionType: string;
  beforeValue: number;
  afterValue: number;
  response: InterventionResponse;
  confidence: number;
}

export interface StudentTarget {
  id?: string;
  studentId: string;
  targetScore: number;
  assessmentType: string;
  targetDate: string; // ISO date
  createdAt?: string;
}

export interface TargetReadinessResult {
  status: TargetStatus;
  currentReadiness: number | null;
  targetScore: number;
  gap: number | null;
  daysRemaining: number | null;
  estimatedWeeksToTarget: number | null;
  message: string;
}

export interface ForecastEvidenceItem {
  metric: string;
  value: number | string;
  contribution: 'POSITIVE' | 'LIMITING' | 'NEUTRAL';
  source: 'FEATURE_5' | 'FEATURE_6' | 'FEATURE_8' | 'FEATURE_9' | 'FEATURE_10';
}

export interface Forecast {
  id?: string;
  studentId: string;
  targetId: string | null;
  type: 'READINESS_FORECAST';
  status: 'GENERATED' | 'INSUFFICIENT_EVIDENCE';
  predictedValue: number | null;
  confidence: ConfidenceLevel;
  confidenceScore: number | null;
  evidenceCount: number;
  dataWindow: { start: string; end: string } | null;
  modelVersion: string;
  trajectory: TrajectoryState;
  momentum: MomentumState;
  volatility: VolatilityState;
  targetStatus: TargetStatus;
  estimatedWeeksToTarget: number | null;
  bottlenecks: BottleneckResult;
  risks: RiskSignal[];
  falseMasterySignals: FalseMasterySignal[];
  evidence: ForecastEvidenceItem[];
  explanation: string | null;
  createdAt: string;
}

/** Everything the forecast engine needs, assembled from Features 3/5/6/8/9. */
export interface EvidenceBundle {
  studentId: string;
  readinessHistory: TrajectoryPoint[]; // Feature 6
  skillHistory: Record<string, TrajectoryPoint[]>; // Feature 5 / Feature 8
  practiceScores: Record<string, number>; // Feature 8 (practice-context mastery)
  transferScores: Record<string, number>; // Feature 8 (transfer/novel-question mastery)
  simulationScores: Record<string, number>; // Feature 9
  simulationTimeRatios: Record<string, number>; // Feature 9 (observed/allocated time)
  lateSessionDeclineRatio: number | null; // Feature 9 (endurance, SS23)
  retentionGapDays: number | null; // Feature 8 (SS24)
  retrievalDeclineDetected: boolean; // Feature 8 (SS24)
  interventionHistory: InterventionOutcome[]; // Feature 7 outcomes, SS25
  target: StudentTarget | null;
  lastActiveAt: string | null;
}
