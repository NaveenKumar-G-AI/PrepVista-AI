export type MasteryLevel = 'NOVICE' | 'DEVELOPING' | 'COMPETENT' | 'STRONG' | 'MASTERED';

export type PriorityTier = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type Goal = 'GENERAL_CODING' | 'PLACEMENT_PREPARATION' | 'INTERVIEW_PREPARATION' | 'ROLE_PREPARATION';

export type EvidenceSource = 'CHALLENGE_ATTEMPT' | 'VERIFICATION' | 'EXPLORATION';

export type EvidenceOutcome = 'SUCCESS' | 'PARTIAL' | 'FAIL';

export type FailureCategory = 'LOGIC' | 'SYNTAX' | 'TIMEOUT' | 'RUNTIME_ERROR';

export type Trend = 'IMPROVING' | 'STABLE' | 'DECLINING';

export type GapStatus =
  | 'UNKNOWN'
  | 'COMPLETE'
  | 'DEVELOPING'
  | 'GAP'
  | 'CRITICAL_GAP'
  | 'BLOCKED'
  | 'INSUFFICIENT_EVIDENCE';

export type MilestoneStatus =
  | 'LOCKED'
  | 'AVAILABLE'
  | 'IN_PROGRESS'
  | 'READY_FOR_VERIFICATION'
  | 'COMPLETED'
  | 'NEEDS_REASSESSMENT';

export type ActivityType =
  | 'LEARN'
  | 'PRACTICE'
  | 'TARGETED_PRACTICE'
  | 'DEBUGGING'
  | 'TRANSFER'
  | 'REVIEW'
  | 'VERIFICATION'
  | 'TIMED_CHALLENGE'
  | 'INTERVIEW_CHALLENGE'
  | 'EXPLORATION';

export type ReadinessState =
  | 'NOT_STARTED'
  | 'FOUNDATION_BUILDING'
  | 'DEVELOPING'
  | 'APPROACHING_READY'
  | 'READY'
  | 'STRONG';

export type RecalcTrigger =
  | 'INITIAL'
  | 'EVIDENCE_UPDATE'
  | 'MILESTONE_COMPLETED'
  | 'DEADLINE_CHANGED'
  | 'TIME_CHANGED'
  | 'ROLE_CHANGED'
  | 'GOAL_CHANGED'
  | 'MANUAL';

export type RelationshipType = 'PREREQUISITE' | 'BUILDS_ON' | 'RELATED' | 'TRANSFER_TO';

export interface Skill {
  id: string;
  name: string;
  category: string;
  description: string | null;
}

export interface SkillPrerequisite {
  skillId: string;
  prerequisiteSkillId: string;
  relationshipType: RelationshipType;
}

export interface Role {
  id: string;
  name: string;
  description: string | null;
}

export interface RoleCompetency {
  id: string;
  roleId: string;
  skillId: string;
  priority: PriorityTier;
  targetMastery: MasteryLevel;
  required: boolean;
  weight: number;
  sequenceHint: number | null;
  description: string | null;
}

export interface Student {
  id: string;
  email: string;
  name: string;
  cohortId: string | null;
}

export interface StudentTarget {
  id: string;
  studentId: string;
  targetRoleId: string;
  goal: Goal;
  targetState: string;
  targetDate: string | null;
  dailyMinutes: number;
  preferredLanguage: string;
  focusAreas: string[];
  isActive: boolean;
}

export interface EvidenceEvent {
  id?: string;
  studentId: string;
  skillId: string;
  source: EvidenceSource;
  outcome: EvidenceOutcome;
  independent: boolean;
  difficulty?: string;
  language?: string;
  failureCategory?: FailureCategory;
  timeTakenSeconds?: number;
  challengeRef?: string;
  createdAt?: string;
}

export interface MasteryState {
  studentId: string;
  skillId: string;
  masteryLevel: MasteryLevel | null;
  confidence: number;
  evidenceCount: number;
  trend: Trend | null;
  recentOutcomes: EvidenceOutcome[];
  lastEvidenceAt: string | null;
}

export interface PriorityFactor {
  value: number;
  weight: number;
  contribution: number;
}

export interface PriorityBreakdown {
  role: PriorityFactor;
  gap: PriorityFactor;
  block: PriorityFactor;
  required: PriorityFactor;
  urgency: PriorityFactor;
  trend: PriorityFactor;
  total: number;
}

export interface RoadmapSkill {
  id: string;
  roadmapMilestoneId: string;
  skillId: string;
  skillName: string;
  required: boolean;
  priorityScore: number;
  priorityBreakdown: PriorityBreakdown;
  gapStatus: GapStatus;
  targetMastery: MasteryLevel;
  currentMasterySnapshot: MasteryLevel | null;
  activityType: ActivityType;
  learningObjective: string;
  sequence: number;
  insertedReason: string | null;
}

export interface RoadmapMilestone {
  id: string;
  roadmapVersionId: string;
  sequence: number;
  name: string;
  description: string;
  status: MilestoneStatus;
  prerequisiteMilestoneIds: string[];
  completionConditions: MilestoneCompletionConditions;
  skills: RoadmapSkill[];
}

export interface MilestoneCompletionConditions {
  requiredSkillsAtTarget: boolean;
  minConfidence: number;
  minIndependentEvidencePerRequiredSkill: number;
  verificationRequired: boolean;
}

export interface RoadmapVersion {
  id: string;
  roadmapId: string;
  versionNumber: number;
  trigger: RecalcTrigger;
  reason: string;
  isCurrent: boolean;
  readinessState: ReadinessState | null;
  readinessScore: number | null;
  atRisk: boolean;
  diff: RoadmapDiff | null;
  createdAt: string;
  milestones: RoadmapMilestone[];
}

export interface RoadmapDiff {
  skillsInserted: Array<{ skillId: string; skillName: string; reason: string }>;
  skillsCompleted: Array<{ skillId: string; skillName: string }>;
  skillsRegressed: Array<{ skillId: string; skillName: string; from: GapStatus; to: GapStatus }>;
  milestonesCompleted: string[];
  summary: string;
}

export interface DimensionScore {
  dimension: string;
  score: number;
  weight: number;
}

export interface ReadinessResult {
  dimensionScores: DimensionScore[];
  overallScore: number;
  state: ReadinessState;
  gatePassed: boolean;
  gateUnmetReasons: string[];
}

export interface DailyPlanBlock {
  minutes: number;
  activityType: ActivityType;
  skillId: string;
  skillName: string;
  label: string;
}

export interface DailyPlan {
  planDate: string;
  primaryAction: string;
  blocks: DailyPlanBlock[];
}

export interface WeeklyPlan {
  weekStart: string;
  objective: string;
  requiredEvidence: string[];
}
