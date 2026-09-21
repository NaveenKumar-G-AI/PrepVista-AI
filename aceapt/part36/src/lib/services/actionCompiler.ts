import { createGoal, createCapabilityArea, createMilestone, createWeeklyObjective, listCapabilities, listMilestones, getActiveMilestone, getCurrentWeeklyObjective } from "../db/repoGoals";
import { createAction, listCandidateActions } from "../db/repoActions";
import { logEvent, createPlanAdjustment } from "../db/repoPlanning";
import { callClaudeJson } from "../ai/client";
import { decomposeSystemPrompt, decomposeUserPrompt } from "../ai/prompts";
import { currentWeekStart } from "./dates";
import type { ActionType, CareerGoal } from "../types";

const MIN_CANDIDATE_SUPPLY = 2;
const TOP_UP_BATCH = 3;

interface RoleProfile {
  matches: RegExp;
  capabilities: string[];
  baselineCapability: string;
}

// Deterministic taxonomy used whenever the AI layer is unavailable —
// keeps capability-area naming consistent (structural data stays in
// code per spec section 55) while still covering common target roles.
const ROLE_PROFILES: RoleProfile[] = [
  {
    matches: /back[\s-]?end/i,
    capabilities: ["Technical Interview Performance", "SQL Reasoning", "System Design", "Project Explanation", "Communication"],
    baselineCapability: "Technical Interview Performance",
  },
  {
    matches: /front[\s-]?end|react|ui/i,
    capabilities: ["Technical Interview Performance", "JavaScript Fundamentals", "UI Implementation", "Project Explanation", "Communication"],
    baselineCapability: "Technical Interview Performance",
  },
  {
    matches: /data\s*(scientist|analyst|engineer)/i,
    capabilities: ["Technical Interview Performance", "SQL Reasoning", "Statistics & ML Fundamentals", "Project Explanation", "Communication"],
    baselineCapability: "Technical Interview Performance",
  },
  {
    matches: /full[\s-]?stack/i,
    capabilities: ["Technical Interview Performance", "SQL Reasoning", "System Design", "UI Implementation", "Project Explanation"],
    baselineCapability: "Technical Interview Performance",
  },
];

const DEFAULT_PROFILE: RoleProfile = {
  capabilities: ["Technical Interview Performance", "Core Fundamentals", "Project Evidence", "Communication"],
  baselineCapability: "Technical Interview Performance",
  matches: /.*/,
};

function profileFor(targetRole: string): RoleProfile {
  return ROLE_PROFILES.find((p) => p.matches.test(targetRole)) ?? DEFAULT_PROFILE;
}

interface PlannedAction {
  title: string;
  description: string;
  actionType: ActionType;
  estimatedMinutes: number;
  capabilityArea: string;
}
interface PlannedMilestone {
  title: string;
  weeklyObjective: string;
  actions: PlannedAction[];
}

function deterministicPlan(targetRole: string): PlannedMilestone[] {
  const profile = profileFor(targetRole);
  const [primary, secondary, tertiary] = profile.capabilities;
  return [
    {
      title: "Baseline Established",
      weeklyObjective: `Establish a starting baseline for ${targetRole}`,
      actions: [
        {
          title: `Baseline ${primary.toLowerCase()} assessment`,
          description: `A short simulation that gives ACEAPT real evidence of where you stand today.`,
          actionType: "SIMULATION",
          estimatedMinutes: 30,
          capabilityArea: primary,
        },
        {
          title: `Explain your strongest project without notes`,
          description: `Practice describing one real project clearly and concisely.`,
          actionType: "PROJECT_WORK",
          estimatedMinutes: 20,
          capabilityArea: "Project Explanation",
        },
        {
          title: `Refresh ${secondary?.toLowerCase() ?? "core"} fundamentals`,
          description: `A focused review session on foundational concepts you'll be tested on.`,
          actionType: "CONCEPT_SESSION",
          estimatedMinutes: 25,
          capabilityArea: secondary ?? primary,
        },
      ],
    },
    {
      title: "Interview Ready",
      weeklyObjective: `Improve ${primary.toLowerCase()}`,
      actions: [
        {
          title: `${primary} practice round`,
          description: `Targeted practice on the area most likely to matter in your next interview.`,
          actionType: "PRACTICE",
          estimatedMinutes: 30,
          capabilityArea: primary,
        },
        {
          title: `${tertiary ?? secondary ?? primary} review`,
          description: `Review and reinforce a supporting capability area.`,
          actionType: "REVIEW",
          estimatedMinutes: 20,
          capabilityArea: tertiary ?? secondary ?? primary,
        },
      ],
    },
  ];
}

async function aiPlan(goalTitle: string, targetRole: string): Promise<PlannedMilestone[] | null> {
  const result = await callClaudeJson<{ milestones: PlannedMilestone[] }>(
    decomposeSystemPrompt(),
    decomposeUserPrompt({ goalTitle, targetRole })
  );
  if (!result?.milestones || !Array.isArray(result.milestones) || result.milestones.length === 0) return null;
  const valid = result.milestones.every(
    (m) => m.title && m.weeklyObjective && Array.isArray(m.actions) && m.actions.length > 0
  );
  return valid ? result.milestones : null;
}

function findOrCreateCapability(userId: string, goalId: string, name: string): string {
  const existing = listCapabilities(userId, goalId).find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing.id;
  return createCapabilityArea(userId, goalId, name).id;
}

async function materializePlan(userId: string, goal: CareerGoal, plan: PlannedMilestone[]): Promise<void> {
  const existingMilestones = listMilestones(goal.id).length;
  for (const [i, m] of plan.entries()) {
    const milestone = createMilestone(goal.id, m.title, existingMilestones + i + 1);
    const objective = createWeeklyObjective(milestone.id, m.weeklyObjective, currentWeekStart());
    for (const a of m.actions) {
      const capabilityId = findOrCreateCapability(userId, goal.id, a.capabilityArea);
      createAction({
        userId,
        goalId: goal.id,
        weeklyObjectiveId: objective.id,
        capabilityAreaId: capabilityId,
        title: a.title,
        description: a.description,
        actionType: a.actionType,
        estimatedMinutes: Math.min(60, Math.max(15, a.estimatedMinutes || 30)),
      });
    }
  }
}

/** Creates a goal and its full initial execution path (2 milestones,
 *  a weekly objective each, and 3-5 concrete actions each). Uses AI
 *  for natural phrasing when available; always falls back to a
 *  deterministic, role-aware plan otherwise (spec sections 13-15, 66). */
export async function bootstrapGoal(userId: string, title: string, targetRole: string): Promise<CareerGoal> {
  const goal = createGoal(userId, title, targetRole);
  const plan = (await aiPlan(title, targetRole)) ?? deterministicPlan(targetRole);
  await materializePlan(userId, goal, plan);
  logEvent(userId, "GOAL_UPDATED", { goalId: goal.id, title: goal.title, targetRole: goal.targetRole });
  logEvent(userId, "PLAN_CREATED", { goalId: goal.id });
  return goal;
}

const TOP_UP_TEMPLATES: { match: RegExp; type: ActionType; title: (c: string) => string; minutes: number }[] = [
  { match: /sql/i, type: "PRACTICE", title: (c) => `${c} interview practice`, minutes: 30 },
  { match: /system design/i, type: "SIMULATION", title: (c) => `${c} scenario walkthrough`, minutes: 35 },
  { match: /interview/i, type: "SIMULATION", title: (c) => `${c} simulation`, minutes: 30 },
  { match: /project/i, type: "PROJECT_WORK", title: (c) => `${c} deep-dive practice`, minutes: 25 },
  { match: /communication/i, type: "PRACTICE", title: (c) => `${c} practice round`, minutes: 20 },
];

function topUpAction(capabilityName: string): { title: string; description: string; actionType: ActionType; minutes: number } {
  const tmpl = TOP_UP_TEMPLATES.find((t) => t.match.test(capabilityName));
  if (tmpl) {
    return {
      title: tmpl.title(capabilityName),
      description: `Continued practice on ${capabilityName.toLowerCase()}.`,
      actionType: tmpl.type,
      minutes: tmpl.minutes,
    };
  }
  return {
    title: `${capabilityName} review session`,
    description: `A focused review to reinforce ${capabilityName.toLowerCase()}.`,
    actionType: "REVIEW",
    minutes: 25,
  };
}

/** Tops up the candidate pool when it runs low, and rolls the active
 *  milestone into a fresh weekly objective when a new week starts.
 *  Called before every ranking pass so the student never sees an
 *  empty Next Move once a goal exists. */
export async function ensureActionSupply(userId: string, goal: CareerGoal): Promise<void> {
  let milestone = getActiveMilestone(goal.id);
  if (!milestone) return; // no plan yet — nothing to top up

  const weekStart = currentWeekStart();
  let objective = getCurrentWeeklyObjective(milestone.id, weekStart);
  if (!objective) {
    objective = createWeeklyObjective(milestone.id, `${milestone.title}: continued progress`, weekStart);
    createPlanAdjustment(userId, goal.id, "NEW_WEEK", "Started a new weekly objective for the active milestone.");
    logEvent(userId, "PLAN_ADJUSTED", { goalId: goal.id, reason: "NEW_WEEK" });
  }

  const candidates = listCandidateActions(userId, goal.id);
  if (candidates.length >= MIN_CANDIDATE_SUPPLY) return;

  const capabilities = listCapabilities(userId, goal.id);
  const bottleneck = capabilities.find((c) => c.isCurrentBottleneck);
  const pool = bottleneck ? [bottleneck, ...capabilities.filter((c) => c.id !== bottleneck.id)] : capabilities;
  if (pool.length === 0) return;

  for (let i = 0; i < TOP_UP_BATCH; i++) {
    const capability = pool[i % pool.length];
    const tmpl = topUpAction(capability.name);
    createAction({
      userId,
      goalId: goal.id,
      weeklyObjectiveId: objective.id,
      capabilityAreaId: capability.id,
      title: tmpl.title,
      description: tmpl.description,
      actionType: tmpl.actionType,
      estimatedMinutes: tmpl.minutes,
    });
  }
  logEvent(userId, "PLAN_ADJUSTED", { goalId: goal.id, reason: "TOP_UP_SUPPLY", count: TOP_UP_BATCH });
}
