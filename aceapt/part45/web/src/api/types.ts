export type Domain = 'QUANTITATIVE_APTITUDE' | 'LOGICAL_REASONING' | 'VERBAL_APTITUDE';
export type SkillLevel = 'DOMAIN' | 'CATEGORY' | 'SKILL' | 'SUBSKILL' | 'MICRO_CAPABILITY';
export type SkillState = 'UNKNOWN' | 'DEVELOPING' | 'STRONG' | 'MASTERED' | 'MAINTENANCE';
export type EvidenceConfidence = 'NONE' | 'LOW' | 'MODERATE' | 'HIGH';
export type RelationshipType = 'PREREQUISITE' | 'DEPENDS_ON' | 'RELATED_TO' | 'BUILDS' | 'TRANSFER_TO' | 'PART_OF' | 'COMMON_ERROR_SOURCE';

export interface SkillRef {
  id: string;
  code: string;
  displayName: string;
}

export interface GraphSkill extends SkillRef {
  domain: Domain;
  level: SkillLevel;
  parentId: string | null;
  status: string;
}

export interface StudentSkillView {
  skillId: string;
  code: string;
  displayName: string;
  domain: Domain;
  level: SkillLevel;
  parentId: string | null;
  capability: number | null;
  state: SkillState;
  trend: 'IMPROVING' | 'DECLINING' | 'STABLE' | null;
  evidenceCount: number;
  confidence: EvidenceConfidence;
  lastEvaluatedAt: string | null;
}

export interface RelatedEdge {
  relationshipId: string;
  relationshipType: RelationshipType;
  weight: number;
  confidence: EvidenceConfidence;
  rationale: string | null;
  skill: SkillRef | null;
  direction: 'from' | 'to';
}

export interface PrioritySignal {
  skillCode: string;
  displayName: string;
  leverageScore: number;
  signals: {
    isGoalRelevant: boolean;
    weaknessScore: number | null;
    evidenceConfidence: EvidenceConfidence;
    downstreamCount: number;
    structuralImportance: number;
  };
  isHighestLeverageCandidate: boolean;
  explanation: string;
}

export interface RootCauseSignal {
  target_skill: string;
  possible_prerequisite_gap: string | null;
  evidence: { target_capability: number | null; prerequisite_capability: number | null };
  confidence: 'low' | 'moderate' | 'high' | 'insufficient_evidence';
  note: string;
}

export interface ValidationIssue {
  severity: 'CRITICAL' | 'WARNING';
  type: string;
  message: string;
  skillIds?: string[];
  relationshipId?: string;
}

export interface ValidationReport {
  isValid: boolean;
  generatedAt: string;
  issueCount: number;
  criticalCount: number;
  warningCount: number;
  issues: ValidationIssue[];
}

export interface GraphVersionSummary {
  id: string;
  versionLabel: string;
  status: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
}

export type GraphFilter = 'ALL' | 'WEAK' | 'STRONG' | 'GOAL_RELEVANT' | 'RECENTLY_PRACTICED' | 'NEEDS_EVIDENCE';
