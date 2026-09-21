// ============================================================================
// ACEAPT — Feature 3: Adaptive Skill Intelligence Engine
// Domain types. This is the vocabulary every engine module and API route
// shares. Keep it the single source of truth — don't redeclare shapes inline
// elsewhere.
// ============================================================================

export type Domain = 'Quantitative' | 'Logical' | 'Verbal' | 'Data Interpretation';

export type CognitiveLevel = 'foundation' | 'application' | 'transfer';

/** The capability ladder. Order matters — index 0 is the floor. */
export const CAPABILITY_LADDER = [
  'NOT_ASSESSED',
  'LIMITED_EVIDENCE',
  'EMERGING',
  'DEVELOPING',
  'FUNCTIONAL',
  'STRONG',
  'ADVANCED',
  'VERIFIED',
  'MASTERED',
] as const;
export type CapabilityState = (typeof CAPABILITY_LADDER)[number];

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

export type RelationshipType =
  | 'PREREQUISITE_OF'
  | 'DEPENDS_ON'
  | 'RELATED_TO'
  | 'SUPPORTS'
  | 'TRANSFER_TO'
  | 'ADVANCED_FORM_OF'
  | 'COMMONLY_CONFUSED_WITH';

export interface Skill {
  id: string;
  domain: Domain;
  topic: string;
  subtopic?: string;
  name: string;
  cognitiveLevels: CognitiveLevel[];
  difficultyBand: [number, number];
}

export interface SkillRelationship {
  id: string;
  fromSkillId: string;
  toSkillId: string;
  type: RelationshipType;
  /** Human-curated confidence, 0–1. AI may propose a relationship, but it
   *  only ever lands here after a human approves it — see ai/provider.ts. */
  curatedConfidence: number;
}

export type EvidenceSource = 'diagnostic' | 'practice' | 'retest';

export interface SkillEvidence {
  id: string;
  studentId: string;
  skillId: string;
  role: 'primary_skill' | 'supporting_skill';
  questionId: string;
  /** Idempotency key — ingesting the same attempt twice must not double count. */
  questionAttemptId: string;
  correct: boolean;
  difficulty: number; // 1–5
  cognitiveLevel: CognitiveLevel;
  timeTakenMs: number;
  expectedTimeMs: number;
  statedConfidence?: 'low' | 'medium' | 'high';
  source: EvidenceSource;
  sessionId: string;
  createdAt: string; // ISO timestamp
}

export interface SelfPerception {
  studentId: string;
  domain: Domain;
  selfRating: 'weak' | 'developing' | 'strong';
  capturedAt: string;
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
  calcVersion: number;
  updatedAt: string;
}

export interface SkillProgressEvent {
  id: string;
  studentId: string;
  skillId: string;
  oldCapability: CapabilityState | null;
  newCapability: CapabilityState;
  reason: string;
  triggeringEvidenceIds: string[];
  createdAt: string;
}

export type FindingType =
  | 'hidden_strength'
  | 'overconfidence_flag'
  | 'prerequisite_dependency'
  | 'recommended_focus'
  | 'general';

export interface SkillInsight {
  id: string;
  studentId: string;
  findingType: FindingType;
  skillId: string;
  evidenceIds: string[];
  interpretation: string;
  confidence: number;
  recommendedFocus: boolean;
  studentMessage: string;
  generatedBy: 'ai' | 'template';
  validated: boolean;
  createdAt: string;
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
