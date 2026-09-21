import type { MasteryState } from "../types/index.js";
import { getMasteryModelConfig } from "../config/masteryModel.js";
import { daysBetween, clamp } from "../utils/stats.js";
import type { PoolClient } from "pg";
import { listAllStudentSkillPairsWithState, upsertReviewEntry } from "../repositories/reviewScheduleRepository.js";
import { getMasteryState } from "../repositories/masteryStateRepository.js";
import { findSkillById } from "../repositories/skillRepository.js";
import { genId } from "../lib/ids.js";

export interface ReviewPriority {
  dueAt: Date;
  isDue: boolean;
  priorityScore: number;
  reason: "AT_RISK" | "MAINTENANCE_DUE" | "RETENTION_DUE" | "PROVISIONAL_CHECK_DUE";
  estimatedMinutes: number;
  verificationObjective: "RECOVERY_CHECK" | "MAINTENANCE_CHECK" | "DELAYED_VERIFICATION" | "PROVISIONAL_CHECK" | "VERIFY_TRANSFER";
}

/**
 * Decides whether/when a skill is next due for a mastery check, and how
 * urgent it is relative to other due skills - the input to the review
 * queue (spec sections 10, 40, 41). Stronger skills get longer intervals
 * and lower priority; AT_RISK/REGRESSED skills always sort to the top.
 * Deliberately returns a priority *score*, not a boolean - the caller
 * decides how many of the "due" skills actually make it into a student's
 * queue (spec section 41: "the queue should remain manageable").
 */
export function computeReviewPriority(state: MasteryState, skillImportance: number, now: Date = new Date()): ReviewPriority {
  const config = getMasteryModelConfig();
  const anchor = state.lastVerifiedAt ? new Date(state.lastVerifiedAt) : new Date(state.updatedAt);

  let intervalDays: number;
  let reason: ReviewPriority["reason"];
  let objective: ReviewPriority["verificationObjective"];
  let estimatedMinutes: number;

  switch (state.state) {
    case "AT_RISK":
    case "REGRESSED":
      intervalDays = config.review.atRiskIntervalDays;
      reason = "AT_RISK";
      objective = "RECOVERY_CHECK";
      estimatedMinutes = 4;
      break;
    case "STABLE_MASTERED":
      intervalDays = config.review.stableIntervalDays;
      reason = "MAINTENANCE_DUE";
      objective = "MAINTENANCE_CHECK";
      estimatedMinutes = 2;
      break;
    case "VERIFIED_MASTERED":
      intervalDays = config.review.verifiedIntervalDays;
      reason = "RETENTION_DUE";
      objective = "DELAYED_VERIFICATION";
      estimatedMinutes = 3;
      break;
    case "PROVISIONALLY_MASTERED":
      intervalDays = config.review.provisionalIntervalDays;
      reason = "PROVISIONAL_CHECK_DUE";
      objective = "VERIFY_TRANSFER";
      estimatedMinutes = 5;
      break;
    default:
      // LEARNING/PRACTICING/IMPROVING/INTRODUCED/UNKNOWN: not review-scheduler
      // territory - that's Feature 5's practice loop, not a verification check.
      intervalDays = config.review.provisionalIntervalDays;
      reason = "PROVISIONAL_CHECK_DUE";
      objective = "PROVISIONAL_CHECK";
      estimatedMinutes = 3;
  }

  const dueAt = new Date(anchor.getTime() + intervalDays * 24 * 60 * 60 * 1000);
  const overdueDays = Math.max(0, daysBetween(dueAt, now));
  const isDue = now.getTime() >= dueAt.getTime();

  const confidencePenalty = state.confidence === "LOW" ? 0.3 : state.confidence === "MEDIUM" ? 0.15 : 0;
  const regressionBoost = state.state === "AT_RISK" ? 0.4 : state.state === "REGRESSED" ? 0.6 : 0;
  const overdueBoost = clamp(overdueDays / 14, 0, 0.5); // saturates after 2 weeks overdue

  const priorityScore = clamp(
    0.3 * clamp(skillImportance, 0, 2) / 2 + confidencePenalty + regressionBoost + overdueBoost,
    0,
    2
  );

  return { dueAt, isDue, priorityScore, reason, estimatedMinutes, verificationObjective: objective };
}

/**
 * Cross-student sweep (spec section 40): refreshes every existing
 * mastery_state's review_schedule entry from its CURRENT dimensions, not
 * just at the moment new evidence arrives. Useful after a config/threshold
 * change, or simply to guarantee every skill has an up-to-date queue entry.
 * Service-scope only (BYPASSRLS) - this is a batch job, not a per-request path.
 */
export async function runReviewSweep(client: PoolClient): Promise<{ scanned: number; scheduled: number }> {
  const pairs = await listAllStudentSkillPairsWithState(client);
  let scheduled = 0;
  const eligible = new Set(["PROVISIONALLY_MASTERED", "VERIFIED_MASTERED", "STABLE_MASTERED", "AT_RISK", "REGRESSED"]);

  for (const pair of pairs) {
    const state = await getMasteryState(client, pair.studentId, pair.skillId);
    if (!state || !eligible.has(state.state)) continue;
    const skill = await findSkillById(client, pair.skillId);
    const priority = computeReviewPriority(state, skill?.importance ?? 1.0);
    await upsertReviewEntry(client, {
      id: genId(),
      studentId: pair.studentId,
      skillId: pair.skillId,
      priorityScore: priority.priorityScore,
      reason: priority.reason,
      dueAt: priority.dueAt.toISOString(),
      estimatedMinutes: priority.estimatedMinutes,
    });
    scheduled++;
  }
  return { scanned: pairs.length, scheduled };
}
