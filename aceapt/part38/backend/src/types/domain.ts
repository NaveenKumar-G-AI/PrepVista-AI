// Domain types for Feature 38. These describe the SHAPE of data the
// positioning engine consumes and produces. They intentionally do not
// duplicate Feature 37's evidence model in full — only the fields the
// positioning engine actually needs are represented here. When wiring this
// up to the real ACEAPT schema, prefer mapping the real models onto these
// shapes rather than growing these types to match the real schema 1:1.

export type EvidenceStrength =
  | "validated"
  | "demonstrated"
  | "developing"
  | "insufficient"
  | "unknown"
  | "conflicted";

export interface Capability {
  id: string;
  name: string;
  evidenceStrength: EvidenceStrength;
  /** IDs into whatever Feature 37 uses as its evidence records (assessments, validations, etc). */
  evidenceSourceIds: string[];
}

export type RequirementImportance = "core" | "supporting" | "nice-to-have";

export interface RoleRequirement {
  id: string;
  name: string;
  importance: RequirementImportance;
}

export interface TargetRole {
  id: string;
  name: string;
  requirements: RoleRequirement[];
}

export interface Opportunity {
  id: string;
  roleId: string;
  companyName: string;
  /** Opportunity-specific requirements. These take precedence over the role's own when present. */
  requirements: RoleRequirement[];
  description?: string;
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

export type StoryCategory =
  | "project"
  | "challenge"
  | "failure"
  | "teamwork"
  | "leadership"
  | "problem-solving"
  | "learning"
  | "technical"
  | "conflict"
  | "achievement";

export interface ProfessionalStory {
  id: string;
  projectId: string | null;
  category: StoryCategory;
  situation?: string;
  task?: string;
  action?: string;
  result?: string;
  hasMeasurableResult: boolean;
}

/** What each existing professional material currently emphasizes, if known. */
export interface ProfileMaterialsSnapshot {
  resumeStatedFocus?: string;
  portfolioStatedFocus?: string;
  introductionStatedFocus?: string;
  interviewStatedFocus?: string;
}

export type PositioningGapType =
  | "skill"
  | "evidence"
  | "story"
  | "relevance"
  | "communication"
  | "consistency";

export interface PositioningGap {
  type: PositioningGapType;
  title: string;
  explanation: string;
  relatedCapabilityId?: string;
}

export interface Differentiator {
  description: string;
  supportingEvidenceIds: string[];
}

export type PositioningStrength = "strong" | "moderate" | "developing" | "insufficient-data";
export type PositioningConfidence = "high" | "medium" | "low";

export interface RankedProject {
  project: ProjectEvidence;
  score: number;
  reasons: string[];
}

export interface RankedStory {
  story: ProfessionalStory;
  reasons: string[];
}

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
