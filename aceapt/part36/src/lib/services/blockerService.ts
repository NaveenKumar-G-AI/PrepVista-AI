import { getActionById, createAction, markBlocked, markDeferred, listChildActions, updateStatus as updateActionStatus } from "../db/repoActions";
import { getDb } from "../db/index";
import { createBlocker, attachBlockerResolution } from "../db/repoExecution";
import { logEvent, createPlanAdjustment } from "../db/repoPlanning";
import { callClaudeJson } from "../ai/client";
import { blockerSystemPrompt, blockerUserPrompt } from "../ai/prompts";
import { getActiveGoal } from "../db/repoGoals";
import type { ActionItem, ActionType, BlockerReasonCode, DifficultyLevel } from "../types";

const NO_SPAWN_REASONS = new Set<BlockerReasonCode>(["NO_TIME", "PRIORITY_CHANGED"]);

const DETERMINISTIC_UNBLOCK: Record<
  Exclude<BlockerReasonCode, "NO_TIME" | "PRIORITY_CHANGED">,
  { title: (t: string) => string; description: string; type: ActionType; minutes: number; difficulty: DifficultyLevel }
> = {
  DONT_UNDERSTAND: {
    title: (t) => `Concept refresher before: ${t}`,
    description: "A short refresher on the underlying idea, then back to the original action.",
    type: "CONCEPT_SESSION",
    minutes: 15,
    difficulty: "BASIC",
  },
  TOO_DIFFICULT: {
    title: (t) => `Simplified version of: ${t}`,
    description: "A guided, lower-difficulty pass at the same skill.",
    type: "PRACTICE",
    minutes: 20,
    difficulty: "BASIC",
  },
  DONT_KNOW_START: {
    title: (t) => `Just the first step: ${t}`,
    description: "Outline an approach before diving in — removes the blank-page problem.",
    type: "REFLECTION",
    minutes: 10,
    difficulty: "BASIC",
  },
  MISSING_PREREQUISITE: {
    title: (t) => `Prerequisite session for: ${t}`,
    description: "Covers the missing foundation this action depends on.",
    type: "CONCEPT_SESSION",
    minutes: 20,
    difficulty: "BASIC",
  },
  OTHER: {
    title: (t) => `Smaller first step toward: ${t}`,
    description: "A scaled-down version to rebuild momentum.",
    type: "PRACTICE",
    minutes: 15,
    difficulty: "BASIC",
  },
};

export interface ReportBlockerResult {
  action: ActionItem;
  unblockAction: ActionItem | null;
}

export async function reportBlocker(
  userId: string,
  actionId: string,
  reasonCode: BlockerReasonCode,
  reasonNote: string | null
): Promise<ReportBlockerResult> {
  const action = getActionById(userId, actionId);
  if (!action) throw new Error("Action not found");

  const blocker = createBlocker({ userId, actionId, reasonCode, reasonNote });
  logEvent(userId, "BLOCKER_REPORTED", { actionId, reasonCode });

  if (NO_SPAWN_REASONS.has(reasonCode)) {
    const deferReason = reasonCode === "NO_TIME" ? "TIME_UNAVAILABLE" : "PRIORITY_CHANGED";
    markDeferred(userId, actionId, deferReason);
    logEvent(userId, "ACTION_DEFERRED", { actionId, reason: deferReason });
    return { action: getActionById(userId, actionId)!, unblockAction: null };
  }

  markBlocked(userId, actionId, reasonCode);
  logEvent(userId, "ACTION_BLOCKED", { actionId, reasonCode });

  const goal = getActiveGoal(userId);
  const det = DETERMINISTIC_UNBLOCK[reasonCode as Exclude<BlockerReasonCode, "NO_TIME" | "PRIORITY_CHANGED">];

  const ai = await callClaudeJson<{
    unblockTitle: string;
    unblockDescription: string;
    estimatedMinutes: number;
    explanation: string;
  }>(
    blockerSystemPrompt(),
    blockerUserPrompt({
      actionTitle: action.title,
      actionType: action.actionType,
      reasonCode,
      reasonNote,
      goalTitle: goal?.title ?? "Career goal",
    })
  );

  const chosen =
    ai && ai.unblockTitle
      ? {
          title: ai.unblockTitle,
          description: ai.unblockDescription || det.description,
          minutes: Math.min(30, Math.max(10, ai.estimatedMinutes || det.minutes)),
        }
      : { title: det.title(action.title), description: det.description, minutes: det.minutes };

  const unblockAction = createAction({
    userId,
    goalId: action.goalId,
    weeklyObjectiveId: action.weeklyObjectiveId,
    capabilityAreaId: action.capabilityAreaId,
    opportunityId: action.opportunityId,
    parentActionId: action.id,
    title: chosen.title,
    description: chosen.description,
    actionType: det.type,
    difficultyLevel: det.difficulty,
    estimatedMinutes: chosen.minutes,
  });

  // The blocked action stays gated until its spawned unblock action
  // is resolved — dependency intelligence via the same parent/child
  // mechanism used for goal decomposition (spec section 31).
  getDb().prepare(`UPDATE action_items SET prerequisite_satisfied = 0 WHERE id = ? AND user_id = ?`).run(actionId, userId);

  attachBlockerResolution(userId, blocker.id, unblockAction.id);
  createPlanAdjustment(
    userId,
    action.goalId,
    "BLOCKER_UNBLOCKED",
    `Added "${unblockAction.title}" to unblock "${action.title}".`
  );
  logEvent(userId, "PLAN_ADJUSTED", { goalId: action.goalId, reason: "BLOCKER_UNBLOCKED", unblockActionId: unblockAction.id });

  return { action: getActionById(userId, actionId)!, unblockAction };
}

/** Re-checks whether a gated action's prerequisites are now satisfied
 *  (all of its child/unblock actions are resolved). Call after any
 *  action reaches a completed or cancelled state. */
export function recheckPrerequisite(userId: string, actionId: string): void {
  const action = getActionById(userId, actionId);
  if (!action) return;
  const children = listChildActions(userId, actionId);
  if (children.length === 0) return;
  const resolvedStatuses = new Set(["SELF_REPORTED_COMPLETE", "VERIFIED_COMPLETE", "MEASURED", "IMPROVED", "CANCELLED"]);
  const allResolved = children.every((c) => resolvedStatuses.has(c.status));
  if (allResolved) {
    getDb().prepare(`UPDATE action_items SET prerequisite_satisfied = 1 WHERE id = ? AND user_id = ?`).run(actionId, userId);
    if (action.status === "BLOCKED") {
      updateActionStatus(userId, actionId, "NOT_STARTED");
    }
  }
}
