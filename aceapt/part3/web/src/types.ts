// Mirrors src/domain/types.ts on the backend. Duplicated intentionally for
// this prototype (frontend and backend build separately) — a real monorepo
// would share this file directly.

export type Domain = 'Quantitative' | 'Logical' | 'Verbal' | 'Data Interpretation';

export type CapabilityState =
  | 'NOT_ASSESSED'
  | 'LIMITED_EVIDENCE'
  | 'EMERGING'
  | 'DEVELOPING'
  | 'FUNCTIONAL'
  | 'STRONG'
  | 'ADVANCED'
  | 'VERIFIED'
  | 'MASTERED';

export type EvidenceStrength = 'NONE' | 'LOW' | 'MODERATE' | 'HIGH' | 'VERIFIED';
export type FreshnessState = 'FRESH' | 'RECENT' | 'AGING' | 'STALE' | 'UNKNOWN';
export type GapType =
  | 'KNOWLEDGE_GAP'
  | 'APPLICATION_GAP'
  | 'TRANSFER_GAP'
  | 'SPEED_GAP'
  | 'CONSISTENCY_GAP'
  | 'RETENTION_GAP'
  | 'INSUFFICIENT_EVIDENCE';

export interface Skill {
  id: string;
  domain: Domain;
  topic: string;
  subtopic?: string;
  name: string;
  cognitiveLevels: string[];
  difficultyBand: [number, number];
}

export interface SubCapabilityRead {
  state: 'LIMITED_EVIDENCE' | 'DEVELOPING' | 'SOLID' | 'STRONG';
  evidenceCount: number;
}

export interface PriorityBreakdown {
  gapSeverity: number;
  downstreamImpact: number;
  goalRelevance: number;
  urgency: number;
  evidenceConfidence: number;
  score: number;
  reasons: string[];
}

export interface StudentSkillState {
  studentId: string;
  skillId: string;
  capability: CapabilityState;
  evidenceStrength: EvidenceStrength;
  foundation: SubCapabilityRead;
  application: SubCapabilityRead;
  transfer: SubCapabilityRead;
  freshness: FreshnessState;
  lastVerifiedAt: string | null;
  gapTypes: GapType[];
  priorityScore: number | null;
  priorityBreakdown: PriorityBreakdown | null;
  updatedAt: string;
}

export interface StudentSkillProfile {
  studentId: string;
  generatedAt: string;
  skills: Array<{ skill: Skill; state: StudentSkillState }>;
  strongest: string[];
  developing: string[];
  limitedEvidence: string[];
  hiddenStrengths: Array<{ skillId: string; domain: Domain; message: string }>;
  overconfidenceFlags: Array<{ skillId: string; domain: Domain; message: string }>;
  recommendedFocus: Array<{ skillId: string; priority: PriorityBreakdown; reason: string }>;
  prerequisiteInsights: Array<{ skillId: string; relatedSkillId: string; message: string }>;
}

export interface SkillDetailResponse {
  skill: Skill;
  state: StudentSkillState | null;
  evidenceCount: number;
  prerequisites: Array<{ fromSkillId: string; toSkillId: string; type: string }>;
  related: Array<{ fromSkillId: string; toSkillId: string; type: string }>;
}
