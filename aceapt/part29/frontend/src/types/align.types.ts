export type CapabilityLevel = 'VERY_WEAK' | 'WEAK' | 'DEVELOPING' | 'MEDIUM' | 'STRONG' | 'VERY_STRONG';
export type ConfidenceBand = 'LOW' | 'MEDIUM' | 'HIGH';
export type ImportanceTier = 'CORE' | 'IMPORTANT' | 'SUPPORTING';
export type AlignmentState = 'STRONGLY_ALIGNED' | 'DEVELOPING_ALIGNMENT' | 'LOW_ALIGNMENT' | 'INSUFFICIENT_EVIDENCE';
export type StrategyTier = 'PRIMARY' | 'SECONDARY' | 'STRETCH';

export interface AlignmentGap {
  capabilityId: string;
  capabilityName: string;
  importance: ImportanceTier;
  currentLevel: CapabilityLevel;
  requiredLevel: CapabilityLevel;
  deficit: number;
  isCritical: boolean;
  confidence: ConfidenceBand;
}

export interface AlignmentStrength {
  capabilityId: string;
  capabilityName: string;
  importance: ImportanceTier;
  level: CapabilityLevel;
}

export interface GapPriority {
  capabilityId: string;
  capabilityName: string;
  priorityScore: number;
  rationale: string[];
}

export interface AlignmentResult {
  studentId: string;
  targetId: string;
  targetName: string;
  calculatedAt: string;
  state: AlignmentState;
  fitScore: number | null;
  readinessScore: number | null;
  confidence: ConfidenceBand;
  strengths: AlignmentStrength[];
  criticalGaps: AlignmentGap[];
  supportingGaps: AlignmentGap[];
  nextBestAction: GapPriority | null;
  insufficientEvidenceCapabilities: string[];
  insufficientEvidenceReason: string | null;
}

export interface TargetPriorityEntry {
  targetId: string;
  targetName: string;
  rank: number;
  tier: StrategyTier;
  fitScore: number | null;
  readinessScore: number | null;
  state: AlignmentState;
  reason: string;
}

export interface WhatIfResult {
  studentId: string;
  targetId: string;
  capabilityId: string;
  currentLevel: CapabilityLevel;
  projectedLevel: CapabilityLevel;
  currentFitScore: number | null;
  projectedFitScore: number | null;
  currentReadinessScore: number | null;
  projectedReadinessScore: number | null;
  projectionReliable: boolean;
  label: 'PROJECTED';
}

export interface AlignmentSnapshot {
  studentId: string;
  targetId: string;
  fitScore: number | null;
  readinessScore: number | null;
  state: AlignmentState;
  capturedAt: string;
}

export interface CohortTargetSummary {
  targetId: string;
  targetName: string;
  counts: Record<AlignmentState, number>;
}
