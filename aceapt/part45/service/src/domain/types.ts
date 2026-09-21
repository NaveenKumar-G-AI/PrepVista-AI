import type { Domain, EvidenceConfidence, GraphStatus, RelationshipSource, RelationshipType, SkillLevel, SkillState, Trend } from './enums';

/** A graph node, trimmed to what the traversal/validation engines need. */
export interface SkillNode {
  id: string;
  code: string;
  displayName: string;
  domain: Domain | string;
  level: SkillLevel | string;
  parentId: string | null;
  status: GraphStatus | string;
}

/** A graph edge, trimmed to what the traversal/validation engines need. */
export interface SkillEdge {
  id: string;
  fromSkillId: string;
  toSkillId: string;
  relationshipType: RelationshipType | string;
  weight: number;
  confidence: EvidenceConfidence | string;
  source: RelationshipSource | string;
  status: GraphStatus | string;
  rationale?: string | null;
}

/** One evidence row, trimmed to what evidence aggregation needs. */
export interface EvidenceEventLike {
  isCorrect: boolean | null;
  weight: number;
  occurredAt: Date;
}

export interface EvidenceAggregate {
  capability: number | null;
  state: SkillState;
  trend: Trend | null;
  evidenceCount: number;
  confidence: EvidenceConfidence;
}

export type ValidationSeverity = 'CRITICAL' | 'WARNING';

export interface ValidationIssue {
  severity: ValidationSeverity;
  type: string;
  message: string;
  skillIds?: string[];
  relationshipId?: string;
}

export interface ValidationReport {
  isValid: boolean; // no CRITICAL issues
  generatedAt: string;
  issueCount: number;
  criticalCount: number;
  warningCount: number;
  issues: ValidationIssue[];
}

/** Mirrors spec section 30's JSON shape exactly. */
export interface RootCauseSignal {
  target_skill: string;
  possible_prerequisite_gap: string | null;
  evidence: {
    target_capability: number | null;
    prerequisite_capability: number | null;
  };
  confidence: 'low' | 'moderate' | 'high' | 'insufficient_evidence';
  note: string;
}

export interface PrioritySignal {
  skillCode: string;
  displayName: string;
  leverageScore: number; // 0-100, relative ranking only — not a probability
  signals: {
    isGoalRelevant: boolean;
    weaknessScore: number | null; // null when UNKNOWN
    evidenceConfidence: EvidenceConfidence;
    downstreamCount: number;
    structuralImportance: number; // normalized 0-1
  };
  isHighestLeverageCandidate: boolean;
  explanation: string;
}
