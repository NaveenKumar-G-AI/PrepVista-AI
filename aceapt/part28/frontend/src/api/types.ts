// Mirrors the shapes returned by the ACEAPT PROOF API (see
// ../../../backend/src/domain/types.ts). Duplicated rather than imported
// because this is a separate frontend package — keep these two files in
// sync if the API contract changes.

export type VerificationStatus = 'NOT_VERIFIED' | 'EMERGING_EVIDENCE' | 'CONDITIONALLY_VERIFIED' | 'VERIFIED' | 'STRONGLY_VERIFIED';
export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type EvidenceType = 'PRACTICE' | 'RETENTION' | 'TRANSFER' | 'NOVEL' | 'TIMED' | 'DIFFICULTY' | 'CONSISTENCY' | 'SIMULATION' | 'REPEATED_VERIFICATION';
export type AgingState = 'VERIFIED' | 'AGING' | 'RECHECK_RECOMMENDED';
export type SimulationMode = 'QUICK_VERIFICATION' | 'STANDARD_VERIFICATION' | 'FULL_SIMULATION' | 'FINAL_READINESS_CHECK';
export type NoveltyLevel = 'FAMILIAR' | 'RELATED' | 'NOVEL' | 'HIGHLY_NOVEL';
export type DifficultyLevel = 'EASY' | 'MEDIUM' | 'HARD' | 'TARGET';

export interface VerificationFactor {
  name: string;
  score: number;
  weight: number;
  threshold: number;
  meetsRequirement: boolean;
  explanation: string;
}

export interface FailureSignature {
  type: string;
  evidenceRefs: string[];
  explanation: string;
}

export interface EvidenceSummary {
  byType: Partial<Record<EvidenceType, { count: number; avgPerformance: number; avgQuality: number }>>;
  totalCount: number;
  overallQuality: number;
}

export interface EvidenceQuality {
  recency: number;
  diversity: number;
  difficulty: number;
  novelty: number;
  independence: number;
  timePressure: number;
  targetRelevance: number;
  repeatedPerformance: number;
}

export interface VerificationEvidence {
  id: string;
  evidenceType: EvidenceType;
  capability: string;
  difficulty: DifficultyLevel;
  novelty: NoveltyLevel;
  performance: number;
  quality: EvidenceQuality;
  createdAt: string;
}

export interface VerificationResult {
  id: string;
  status: VerificationStatus;
  confidence: ConfidenceLevel;
  factors: VerificationFactor[];
  evidenceSummary: EvidenceSummary;
  failureSignatures: FailureSignature[];
  explanation: string;
  createdAt: string;
}

export interface ProofStatus {
  hasResult: boolean;
  result?: VerificationResult;
  agingState?: AgingState;
  message?: string;
}

export interface ProofSnapshot {
  id: string;
  status: VerificationStatus;
  confidence: ConfidenceLevel;
  verifiedAt: string | null;
  agingState: AgingState;
  createdAt: string;
}

export interface TargetedVerificationPlan {
  capability: string;
  condition: 'TIME_PRESSURE' | 'NOVELTY' | 'STANDARD' | 'CONSISTENCY';
  novelty: NoveltyLevel;
  durationMinutes: number;
  reason: string;
  evidenceSufficient: boolean;
  simulationProfile: {
    mode: SimulationMode;
    questionCount: number;
  };
}

export interface StartVerificationResponse {
  plan: TargetedVerificationPlan;
  sessionId: string | null;
}

export interface CompleteVerificationResponse {
  result: VerificationResult;
  narrative: string;
  snapshot: ProofSnapshot | null;
  adaptResponse: { interventionId: string; accepted: boolean } | null;
  alreadyCompleted: boolean;
}
