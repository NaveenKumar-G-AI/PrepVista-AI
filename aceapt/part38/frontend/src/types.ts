export type EvidenceStrength = "validated" | "demonstrated" | "developing" | "insufficient" | "unknown" | "conflicted";

export interface Capability {
  id: string;
  name: string;
  evidenceStrength: EvidenceStrength;
  evidenceSourceIds: string[];
}

export type PositioningGapType = "skill" | "evidence" | "story" | "relevance" | "communication" | "consistency";

export interface PositioningGap {
  type: PositioningGapType;
  title: string;
  explanation: string;
  relatedCapabilityId?: string;
}

export interface ProjectEvidence {
  id: string;
  title: string;
  description: string;
  technologies: string[];
  validated: boolean;
  recencyMonthsAgo: number;
  evidenceSourceIds: string[];
}

export interface RankedProject {
  project: ProjectEvidence;
  score: number;
  reasons: string[];
}

export interface ProfessionalStory {
  id: string;
  projectId: string | null;
  category: string;
  situation?: string;
  task?: string;
  action?: string;
  result?: string;
  hasMeasurableResult: boolean;
}

export interface RankedStory {
  story: ProfessionalStory;
  reasons: string[];
}

export interface Differentiator {
  description: string;
  supportingEvidenceIds: string[];
}

export type PositioningStrength = "strong" | "moderate" | "developing" | "insufficient-data";
export type PositioningConfidence = "high" | "medium" | "low";

export interface PositioningProfile {
  studentId: string;
  targetRoleId: string;
  targetRoleName: string;
  opportunityId?: string;
  primaryPosition: string;
  narrativeSource: "ai" | "template-fallback";
  strongestEvidence: Capability[];
  differentiators: Differentiator[];
  gaps: PositioningGap[];
  bestProject: RankedProject | null;
  secondBestProject: RankedProject | null;
  bestStory: RankedStory | null;
  positioningStrength: PositioningStrength;
  confidence: PositioningConfidence;
  confidenceExplanation: string;
  generatedAt: string;
  version: number;
}
