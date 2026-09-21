// Structured handoff payloads (Sections 41-43, 72). Feature 44 stops
// here - it produces the objective, the planner schedules it, the
// learning system delivers it, the readiness engine folds it in. None
// of those systems exist in this standalone reference implementation;
// these builders are the documented contract they would consume.
import type { Goal, GoalMilestone, PriorityResult } from "../domain/types.js";

export interface LearningHandoffPayload {
  goal_id: string;
  objective: string;
  priority_skills: string[];
  target_state: Record<string, unknown>;
  constraints: Record<string, unknown>;
  deadline: string | null;
  reason: string;
}

export function buildLearningHandoff(goal: Goal, priority: PriorityResult, topReason: string): LearningHandoffPayload {
  return {
    goal_id: goal.id,
    objective: `strengthen ${(priority.top ?? "overall aptitude").replace(/_/g, " ")}`,
    priority_skills: priority.ranked.slice(0, 3).map((r) => r.target),
    target_state: goal.targetCapability,
    constraints: { availableTime: goal.availableTime },
    deadline: goal.targetDate,
    reason: topReason,
  };
}

export interface PlannerHandoffPayload {
  goal: string;
  deadline: string | null;
  available_minutes: Goal["availableTime"];
  priority_skills: string[];
  milestones: { title: string; status: string; sequence: number }[];
  constraints: Record<string, unknown>;
  current_capability: unknown;
  target_capability: unknown;
}

export function buildPlannerHandoff(goal: Goal, priority: PriorityResult, milestones: GoalMilestone[]): PlannerHandoffPayload {
  return {
    goal: goal.title,
    deadline: goal.targetDate,
    available_minutes: goal.availableTime,
    priority_skills: priority.ranked.slice(0, 3).map((r) => r.target),
    milestones: milestones.map((m) => ({ title: m.title, status: m.status, sequence: m.sequence })),
    constraints: { deadlineType: goal.deadlineType },
    current_capability: goal.currentStateSnapshot,
    target_capability: goal.targetCapability,
  };
}

export interface ReadinessHandoffPayload {
  current_capability: unknown;
  target_capability: unknown;
  gap: unknown;
  trend: "IMPROVING" | "FLAT" | "DECLINING" | "UNKNOWN";
  evidence_quality: Goal["confidence"];
  goal_health: Goal["health"];
}

export function buildReadinessHandoff(goal: Goal, trend: ReadinessHandoffPayload["trend"]): ReadinessHandoffPayload {
  return {
    current_capability: goal.currentStateSnapshot,
    target_capability: goal.targetCapability,
    gap: goal.gapSnapshot,
    trend,
    evidence_quality: goal.confidence,
    goal_health: goal.health,
  };
}
