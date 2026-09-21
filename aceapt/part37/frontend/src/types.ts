export type RequiredLevel = 'BASIC' | 'INTERMEDIATE' | 'STRONG';

export type EvidenceSourceType =
  | 'SELF_REPORT'
  | 'TRAINING'
  | 'CERTIFICATE'
  | 'ASSESSMENT'
  | 'CODING_TEST'
  | 'PROJECT'
  | 'SIMULATION'
  | 'MOCK_INTERVIEW'
  | 'INTERVIEW'
  | 'RESUME'
  | 'PORTFOLIO'
  | 'OPPORTUNITY_OUTCOME';

export type EvidenceClass = 'SELF_REPORTED' | 'ACTIVITY' | 'KNOWLEDGE' | 'PRACTICE' | 'DEMONSTRATED' | 'VALIDATED' | 'REAL_WORLD';

export const EVIDENCE_CLASS_ORDER: EvidenceClass[] = [
  'SELF_REPORTED',
  'ACTIVITY',
  'KNOWLEDGE',
  'PRACTICE',
  'DEMONSTRATED',
  'VALIDATED',
  'REAL_WORLD',
];

export type CapabilityEvidenceLabel = 'UNKNOWN' | 'LIMITED' | 'DEVELOPING' | 'STRONG';

export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type FreshnessState = 'RECENT' | 'AGING' | 'STALE' | 'REVALIDATION_RECOMMENDED';

export type ReadinessState = 'UNKNOWN' | 'EXPLORING' | 'BUILDING' | 'DEVELOPING' | 'VALIDATING' | 'READY_TO_TEST' | 'STRONG_EVIDENCE';

export type CapabilityImportance = 1 | 2 | 3;

export interface CapabilityStatus {
  capabilityId: string;
  capabilityName: string;
  requiredLevel: RequiredLevel;
  importance: CapabilityImportance;
  label: CapabilityEvidenceLabel;
  achievedClass: EvidenceClass | null;
  confidence: ConfidenceLevel;
  independentSourceCount: number;
  freshestEvidenceDate: string | null;
  freshnessState: FreshnessState | null;
  hasConflict: boolean;
  conflictExplanation: string | null;
  contributingEvidenceIds: string[];
  reasons: string[];
  meetsRequirement: boolean;
}

export interface ReadinessGap {
  capabilityId: string;
  capabilityName: string;
  requiredLevel: RequiredLevel;
  currentLabel: CapabilityEvidenceLabel;
  importance: CapabilityImportance;
  distance: number;
}

export interface NextProofRecommendation {
  capabilityId: string;
  capabilityName: string;
  headline: string;
  description: string;
  ctaLabel: string;
  actionRef?: string;
}

export interface ClaimComparison {
  capabilityId: string;
  capabilityName: string;
  comparison: {
    status: 'ALIGNED' | 'OVERCLAIM' | 'UNDERCLAIM' | 'NO_CLAIM';
    message: string;
  };
}

export interface ReadinessDTO {
  roleId: string;
  roleName: string;
  state: ReadinessState;
  confidence: ConfidenceLevel;
  capabilityStatuses: CapabilityStatus[];
  gaps: ReadinessGap[];
  topGap: ReadinessGap | null;
  reasons: string[];
  nextProof: NextProofRecommendation | null;
  overPreparationNote: string | null;
  underPreparationNote: string | null;
  claimComparisons: ClaimComparison[];
  computedAt: string;
}

export interface TargetRole {
  roleId: string;
  roleName: string;
  isPrimary: boolean;
}

export interface JourneyEntry {
  state: ReadinessState;
  stateLabel: string;
  confidence: ConfidenceLevel;
  reasonSummary: string;
  occurredAt: string;
}

export interface EvidenceItem {
  id: string;
  capabilityId: string;
  sourceType: EvidenceSourceType;
  occurredAt: string;
  score: number | null;
  outcome: 'PASSED' | 'FAILED' | 'STRONG' | 'WEAK' | 'COMPLETED' | null;
  context: string | null;
  validationState: 'UNVALIDATED' | 'SELF_ASSERTED' | 'VALIDATED' | 'DISPUTED';
  claimedLevel?: RequiredLevel | null;
}
