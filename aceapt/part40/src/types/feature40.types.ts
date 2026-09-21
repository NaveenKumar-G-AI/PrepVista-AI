// Shared types across services/routes. Mirrors the Postgres enums in
// db/migrations/002-004 -- keep these in sync if the SQL changes.

export type ConfidenceLevel = 'HIGH' | 'MODERATE' | 'LOW' | 'UNKNOWN';

export type SourceType =
  | 'VERIFIED_MARKET_DATA'
  | 'EMPLOYER_JOB_DATA'
  | 'PLATFORM_HISTORICAL_DATA'
  | 'TRUSTED_RESEARCH'
  | 'STUDENT_DATA'
  | 'AI_INFERENCE';

export type RoleChangeClassification = 'STABLE' | 'EVOLVING' | 'TRANSFORMING' | 'EMERGING' | 'UNCERTAIN';

export type SkillTrendClassification = 'DURABLE' | 'GROWING' | 'EMERGING' | 'ROLE_SPECIFIC' | 'DECLINING' | 'UNKNOWN';

export type FutureGapSeverity = 'CRITICAL' | 'HIGH' | 'MODERATE' | 'OPTIONAL' | 'UNKNOWN';

export type FutureGapStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'DISMISSED';

export type ExperimentStatus = 'ACTIVE' | 'COMPLETED' | 'ABANDONED';

export type LearningPriorityTier = 'HIGH_VALUE' | 'MEDIUM_VALUE' | 'LOW_PRIORITY' | 'NOT_A_PRIORITY_RIGHT_NOW';

export type TechnologyDecision = 'LEARN_NOW' | 'MONITOR' | 'OPTIONAL' | 'NOT_A_PRIORITY';

export type ReadinessStatus = 'STRONG' | 'DEVELOPING' | 'NEEDS_ATTENTION' | 'UNKNOWN';

/** Every value that carries market or AI-derived meaning ships with this envelope
 * (spec ??59 Source Transparency, ??60 Confidence Model, ??61 Stale Data Protection). */
export interface SourceMeta {
  sourceType: SourceType;
  period: string;
  confidence: ConfidenceLevel;
  sampleSize: number;
  isStale: boolean;
  lastUpdated: string; // ISO timestamp
}

export interface EvidenceInput {
  sampleSize: number;
  sourceQuality: number; // 0..1
  recencyDays: number;
  sourceAgreement: number; // 0..1
}

export interface SkillTrendCard {
  skillId: string;
  skillName: string;
  classification: SkillTrendClassification;
  marketSignal: string; // human label, e.g. "Emerging"
  studentStatus: string; // human label, e.g. "Limited evidence"
  whyItMatters: string;
  recommendedAction: string;
  meta: SourceMeta;
}

export interface FutureGapCard {
  id: string;
  skillId: string | null;
  skillName: string | null;
  severity: FutureGapSeverity;
  marketExpectation: string;
  studentEvidence: string;
  explanation: string;
  recommendedAction: string;
  status: FutureGapStatus;
  meta: SourceMeta;
}

export interface RoleEvolutionCard {
  roleId: string;
  roleTitle: string;
  classification: RoleChangeClassification;
  then: string;
  now: string;
  emerging: string;
  futurePossibility: string;
  aiImpact: {
    aiAssistedTasks: string[];
    humanCriticalTasks: string[];
    aiComplementarySkills: string[];
    newResponsibilities: string[];
    potentialRisks: string[];
    potentialOpportunities: string[];
  };
  meta: SourceMeta;
}

export interface MarketSignalItem {
  id: string;
  signalType: string;
  targetLabel: string; // role title or skill name this signal is about
  period: string;
  strength: number;
  interpretation: string;
  meta: SourceMeta;
}

export interface LearningPriorityItem {
  skillId: string;
  skillName: string;
  why: string;
  marketSignal: string;
  currentEvidence: string;
  gap: FutureGapSeverity;
  effort: 'LOW' | 'MEDIUM' | 'HIGH';
  evidenceOpportunity: string;
  nextAction: string;
  tier: LearningPriorityTier;
}

export interface ProjectRecommendation {
  title: string;
  rationale: string;
  targetGapIds: string[];
  producesEvidenceFor: string[]; // skill names
  complexity: 'LOW' | 'MEDIUM' | 'HIGH';
  portfolioValue: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface CareerBranch {
  category: 'PRIMARY' | 'SPECIALIST' | 'ADJACENT' | 'EMERGING' | 'EXPLORATORY';
  roleId: string;
  roleTitle: string;
  whyItFits: string;
  transferableSkills: string[];
  gaps: string[];
  requiredEvidence: string[];
  marketDirection: RoleChangeClassification;
}

export interface CareerComparisonRow {
  roleId: string;
  roleTitle: string;
  currentFit: string;
  futureAdaptability: string;
  marketDirection: RoleChangeClassification;
  aiTransformation: string;
  learningEffort: 'LOW' | 'MEDIUM' | 'HIGH';
  evidenceRequirement: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface FutureReadiness {
  dimensions: {
    transferableSkills: ReadinessStatus;
    evidenceDepth: ReadinessStatus;
    skillDiversity: ReadinessStatus;
    adaptability: ReadinessStatus;
    marketAlignment: ReadinessStatus;
    roleDiversification: ReadinessStatus;
    emergingCapabilities: ReadinessStatus;
  };
  overall: ReadinessStatus;
  explanations: Record<string, string>;
}

export interface CareerHorizonResponse {
  studentId: string;
  hasTargetRole: boolean;
  targetRole: { id: string; title: string } | null;
  current: {
    capabilities: string[];
    evidenceCount: number;
    readiness: FutureReadiness | null;
  };
  market: {
    signals: MarketSignalItem[];
    changedSincePriorPeriod: string[];
  };
  roleEvolution: RoleEvolutionCard | null;
  futureGaps: FutureGapCard[];
  strategicPriorities: {
    learning: LearningPriorityItem[];
    projects: ProjectRecommendation[];
    focusModeActive: boolean;
    focusModeMessage: string | null;
  };
  futurePaths: CareerBranch[];
  discoveryMode: boolean;
  discoveryDirections: CareerBranch[] | null;
  emptyStates: {
    noTargetRole: string | null;
    noEvidence: string | null;
    noMarketData: string | null;
  };
}
