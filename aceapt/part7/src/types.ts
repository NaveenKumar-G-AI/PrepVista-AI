export type ActionType =
  | 'LEARN'
  | 'REVISE'
  | 'PRACTICE'
  | 'TIMED_PRACTICE'
  | 'ERROR_REPAIR'
  | 'MIXED_PRACTICE'
  | 'STRATEGY_TRAINING'
  | 'REASSESS'
  | 'MAINTAIN'
  | 'RESTORE';

export type PriorityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type ActionStatus = 'RECOMMENDED' | 'STARTED' | 'COMPLETED' | 'SKIPPED' | 'EXPIRED' | 'REPLACED';

export interface StudentAction {
  id: string;
  student_id: string;
  action_type: ActionType;
  target_skill: string;
  target_skill_name: string;
  priority: PriorityLevel;
  priority_score: number;
  reason: string;
  why_this: string;
  duration_minutes: number;
  expected_outcome: string;
  required_feature: 'FEATURE_5' | 'FEATURE_6';
  success_metric: string;
  verification_method: string;
  confidence: ConfidenceLevel;
  status: ActionStatus;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

export interface PrioritySignal {
  skill_id: string;
  skill_name: string;
  category: string;
  problem_type: string;
  priority_score: number;
  priority: PriorityLevel;
  details: string;
}

export interface PriorityBoardData {
  top: PrioritySignal[];
  secondary: PrioritySignal[];
  maintain: PrioritySignal[];
}

export interface PlannedItem {
  skill_name: string;
  action_type: string;
  duration_minutes: number;
}

export interface ReadinessGap {
  current: number;
  target: number;
  gap: number;
  contributors: { skill_name: string; category: string; contribution: number }[];
  explanation: string;
}

export interface Milestone {
  id: string;
  objective: string;
  target_skill?: string;
  target: number;
  progress: number;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETE';
  order: number;
}

export interface ProgressPoint {
  readiness: number;
  taken_at: string;
  driver_action: string;
}

export interface StudentSummary {
  id: string;
  name: string;
  readiness: number;
  goal: { goal_type: string; target?: number } | null;
}
