// Mirrors src/domain/types.ts but kept dependency-free so these components
// can be copied into a host app without pulling in the backend package.

export type NodeStatus = "VERIFIED" | "IN_PROGRESS" | "UPCOMING" | "DEFERRED" | "REVIEW_DUE";
export type ActionType = "LEARN" | "RELEARN" | "PRACTICE" | "DRILL" | "REVIEW" | "TRANSFER" | "SPEED_TRAIN" | "RETEST" | "ADVANCE" | "REST";

export interface PathNodeView {
  skillId: string;
  skillName: string;
  order: number;
  status: NodeStatus;
  priorityScore: number;
  reason: string;
  estimatedMinutes: number;
  action: { actionType: ActionType; reason: string; interventionType?: string };
}

export interface PathVersionView {
  versionNumber: number;
  reason: string;
  tradeoffMessage: string | null;
  nodes: PathNodeView[];
}

export interface WhyThisView {
  what: string;
  why: string;
  evidence: string;
  impact: string;
  next: string;
}

export interface DailyMissionView {
  totalMinutes: number;
  segments: { label: string; minutes: number; description: string }[];
}
