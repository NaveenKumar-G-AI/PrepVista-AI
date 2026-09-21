// ACEAPT Pathfinder — Feature 22
// Core domain types for the Adaptive Personal Learning Path & Goal Optimization Engine.
//
// SCOPE NOTE (see README.md for the full explanation):
// No existing ACEAPT codebase was attached to this task, so these types are a
// clean-room scaffold — internally consistent and ready to be re-mapped onto
// real Student / Skill / Assessment models when this merges into the actual
// repo. Section references (e.g. "Section 11") point back to the Feature 22
// spec so a reviewer can trace every field to a requirement.

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export enum GoalType {
  PLACEMENT_READINESS = "PLACEMENT_READINESS",
  APTITUDE_MASTERY = "APTITUDE_MASTERY",
  TARGET_SCORE = "TARGET_SCORE",
  TARGET_ASSESSMENT = "TARGET_ASSESSMENT",
  TARGET_ROLE = "TARGET_ROLE",
  TARGET_DATE = "TARGET_DATE",
  SKILL_MASTERY = "SKILL_MASTERY",
  PERFORMANCE_IMPROVEMENT = "PERFORMANCE_IMPROVEMENT",
  MAINTENANCE = "MAINTENANCE",
  CUSTOM = "CUSTOM",
}

export enum GoalStatus {
  ACTIVE = "ACTIVE",
  PAUSED = "PAUSED",
  ACHIEVED = "ACHIEVED",
  ABANDONED = "ABANDONED",
}

// Section 18 — deliberately more than DONE / NOT_DONE.
export enum PathNodeState {
  NOT_STARTED = "NOT_STARTED",
  INTRODUCED = "INTRODUCED",
  LEARNING = "LEARNING",
  PRACTICING = "PRACTICING",
  DEVELOPING = "DEVELOPING",
  MASTERED = "MASTERED",
  TRANSFER_VERIFIED = "TRANSFER_VERIFIED",
  RETAINED = "RETAINED",
  READY = "READY",
  WEAKENING = "WEAKENING",
  REPAIR_REQUIRED = "REPAIR_REQUIRED",
  MAINTENANCE = "MAINTENANCE",
  SKIPPED = "SKIPPED",
  BLOCKED = "BLOCKED",
}

export enum ActionType {
  RECALL = "RECALL",
  LEARN = "LEARN",
  PRACTICE = "PRACTICE",
  TRANSFER_DRILL = "TRANSFER_DRILL",
  TIMED_DRILL = "TIMED_DRILL",
  QUESTION_SELECTION = "QUESTION_SELECTION",
  MIXED_PRACTICE = "MIXED_PRACTICE",
  SIMULATION = "SIMULATION",
  REACTIVATION = "REACTIVATION",
  VERIFICATION = "VERIFICATION",
  MAINTENANCE_CHECK = "MAINTENANCE_CHECK",
}

export enum PriorityCategory {
  CRITICAL = "CRITICAL",
  HIGH = "HIGH",
  MEDIUM = "MEDIUM",
  LOW = "LOW",
  MAINTENANCE = "MAINTENANCE",
}

// Section 23 — path adaptation triggers.
export enum AdaptationTrigger {
  MAJOR_IMPROVEMENT = "MAJOR_IMPROVEMENT",
  MAJOR_REGRESSION = "MAJOR_REGRESSION",
  TRANSFER_FAILURE = "TRANSFER_FAILURE",
  RETENTION_DECAY = "RETENTION_DECAY",
  INTERVENTION_FAILURE = "INTERVENTION_FAILURE",
  INTERVENTION_SUCCESS = "INTERVENTION_SUCCESS",
  NEW_MOCK_RESULT = "NEW_MOCK_RESULT",
  GOAL_CHANGE = "GOAL_CHANGE",
  DEADLINE_CHANGE = "DEADLINE_CHANGE",
  AVAILABLE_TIME_CHANGE = "AVAILABLE_TIME_CHANGE",
  NEW_ASSESSMENT = "NEW_ASSESSMENT",
  NEW_HIGH_CONFIDENCE_EVIDENCE = "NEW_HIGH_CONFIDENCE_EVIDENCE",
}

// Section 24 — evidence-strength response tiers.
export type StabilityTier = "KEEP_PATH" | "ADJUST_NODE" | "REPLAN";

// ---------------------------------------------------------------------------
// Evidence-aware metric (Section 11: "Do not pretend that missing data is zero")
// ---------------------------------------------------------------------------

export interface MetricReading {
  value: number | null; // null = no evidence yet, never coerced to 0
  source: string;
  timestamp: string;
  confidence: number; // 0..1
  evidenceCount: number;
}

export type CapabilityKey =
  | "mastery"
  | "retention"
  | "transfer"
  | "reasoning"
  | "accuracy"
  | "speed"
  | "questionSelection"
  | "simulationPerformance"
  | "consistency"
  | "readiness";

// ---------------------------------------------------------------------------
// Skills (Section 13 — prerequisite graph for bottleneck detection)
// ---------------------------------------------------------------------------

export interface Skill {
  skillId: string;
  name: string;
  prerequisiteSkillIds: string[]; // upstream dependencies this skill relies on
}

export interface SkillState {
  skillId: string;
  mastery: MetricReading;
  transfer: MetricReading;
  timedAccuracy: MetricReading;
  retention: MetricReading;
}

export interface StudentState {
  studentId: string;
  asOf: string;
  capabilities: Record<CapabilityKey, MetricReading>;
  skills: Record<string, SkillState>; // skillId -> granular state
  recentTrend?: "IMPROVING" | "STABLE" | "DECLINING";
}

// ---------------------------------------------------------------------------
// Goal (Section 8)
// ---------------------------------------------------------------------------

export interface LearningGoal {
  goalId: string;
  studentId: string;
  goalType: GoalType;
  title: string;
  description?: string;
  targetValue?: number;
  targetMetric?: string;
  deadline?: string; // ISO date
  priority?: number;
  availableTimeMinutesPerDay?: number;
  assessmentType?: string;
  requiredCapabilities?: CapabilityKey[];
  status: GoalStatus;
  createdAt: string;
  updatedAt: string;
}

// Section 10 — a goal translated into measurable requirements.
export interface GoalRequirement {
  metric: CapabilityKey | string;
  targetValue: number;
  weight: number; // relative importance, 0..1
  rationale: string;
}

// ---------------------------------------------------------------------------
// Gap (Section 12)
// ---------------------------------------------------------------------------

export type GapStatus = "ABOVE_TARGET" | "AT_TARGET" | "GAP" | "UNKNOWN";

export interface GapAnalysis {
  metric: CapabilityKey | string;
  current: number | null;
  target: number;
  delta: number | null; // current - target
  status: GapStatus;
  confidence: number;
  weight: number;
}

// ---------------------------------------------------------------------------
// Bottleneck (Section 13)
// ---------------------------------------------------------------------------

export interface Bottleneck {
  skillId: string;
  skillName: string;
  severity: number; // 0..1, how weak the skill is
  prerequisiteImpact: number; // 0..1, how many downstream skills it blocks
  goalRelevance: number; // 0..1
  improvementPotential: number; // 0..1
  score: number; // combined, explainable
  affectedDownstreamSkillIds: string[];
  reason: string;
}

export interface PrimaryBottleneck {
  label: string; // e.g. "Transfer under time pressure"
  reason: string;
  relatedSkillId?: string;
  relatedMetrics: (CapabilityKey | string)[];
}

// ---------------------------------------------------------------------------
// Priority (Section 14-15)
// ---------------------------------------------------------------------------

export interface PriorityFactors {
  goalRelevance: number;
  gapMagnitude: number;
  prerequisiteImpact: number;
  urgency: number;
  assessmentWeight: number;
  retentionRisk: number;
  transferRisk: number;
  expectedImprovement: number;
  timeCost: number;
  confidence: number;
}

export interface PriorityItem {
  id: string;
  label: string;
  category: PriorityCategory;
  score: number;
  factors: PriorityFactors;
  reason: string;
  skillId?: string;
}

// ---------------------------------------------------------------------------
// Path graph (Sections 16-18)
// ---------------------------------------------------------------------------

export interface PathNode {
  nodeId: string;
  skillId: string;
  actionType: ActionType;
  label: string;
  state: PathNodeState;
  prerequisites: string[]; // nodeIds
  successCriteria: string;
  estimatedDurationMinutes: number;
  evidenceRequirements: string[];
  reason: string;
  createdAt: string;
  updatedAt: string;
}

export interface PathEdge {
  fromNodeId: string;
  toNodeId: string;
}

export interface PathGraph {
  pathId: string;
  studentId: string;
  goalId: string;
  version: number;
  nodes: PathNode[];
  edges: PathEdge[];
  currentNodeId: string | null;
  createdAt: string;
}

// Section 25 — never destroy previous plans.
export interface PathVersion {
  version: number;
  pathId: string;
  snapshot: PathGraph;
  reasonForChange: string;
  createdAt: string;
}

// Section 26 — every major decision is traceable.
export interface PathDecision {
  decisionId: string;
  studentId: string;
  previousPathVersion: number | null;
  newPathVersion: number;
  trigger: AdaptationTrigger;
  evidence: string;
  confidence: number;
  reason: string;
  expectedOutcome: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Events (Section 47) — reuse the real ACEAPT event bus shape when available.
// ---------------------------------------------------------------------------

export type PathfinderEvent =
  | { type: "GOAL_CREATED"; goalId: string; timestamp: string }
  | { type: "GOAL_UPDATED"; goalId: string; timestamp: string }
  | { type: "PATH_CREATED"; pathId: string; version: number; timestamp: string }
  | { type: "PATH_UPDATED"; pathId: string; version: number; timestamp: string }
  | { type: "PATH_REPLANNED"; pathId: string; fromVersion: number; toVersion: number; timestamp: string }
  | { type: "SKILL_STATE_CHANGED"; skillId: string; timestamp: string }
  | { type: "MILESTONE_REACHED"; milestone: string; timestamp: string }
  | { type: "EVIDENCE_RECEIVED"; skillId: string; timestamp: string }
  | { type: "PATH_NODE_STARTED"; nodeId: string; timestamp: string }
  | { type: "PATH_NODE_COMPLETED"; nodeId: string; timestamp: string }
  | { type: "PATH_NODE_SKIPPED"; nodeId: string; timestamp: string };
