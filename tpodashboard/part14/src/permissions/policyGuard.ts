import type { ActorContext, RiskLevel } from "../types/action.types.js";

export type ApprovalMode = "ALWAYS_CONFIRM" | "CONFIRM_IF_BULK" | "PRE_APPROVED" | "NEVER_AUTONOMOUS";

export interface InstitutionPolicy {
  /** Max recipients a communication action may target in one action, above which it is blocked outright (must be split). */
  maxBulkRecipients: number;
  /** Bulk threshold above which CONFIRM_IF_BULK behaves like ALWAYS_CONFIRM. */
  bulkConfirmationThreshold: number;
  /** Max records an autonomous (rule-triggered, PRE_APPROVED) action may touch without falling back to human confirmation. */
  maxAutonomousRecipients: number;
  /** Per action-type approval mode. */
  approvalModeByActionType: Record<string, ApprovalMode>;
}

/** Institution-configurable policy (spec sections 23, 51, 53). Swap for a real per-institution settings table. */
export const institutionPolicy: InstitutionPolicy = {
  maxBulkRecipients: 2000,
  bulkConfirmationThreshold: 1,
  maxAutonomousRecipients: 1,
  approvalModeByActionType: {
    create_tpo_task: "PRE_APPROVED",
    send_application_reminder: "ALWAYS_CONFIRM",
    assign_training_to_cohort: "ALWAYS_CONFIRM",
    publish_interview_results: "ALWAYS_CONFIRM",
    accept_offer: "ALWAYS_CONFIRM",
    notify_student_result_published: "PRE_APPROVED",
  },
};

export interface GuardResult {
  ok: boolean;
  reason?: string;
}

export function checkBulkLimit(count: number): GuardResult {
  if (count > institutionPolicy.maxBulkRecipients) {
    return {
      ok: false,
      reason: `This action would affect ${count} records, exceeding the institution's bulk limit of ${institutionPolicy.maxBulkRecipients}. Split into smaller batches.`,
    };
  }
  return { ok: true };
}

export function approvalModeFor(actionType: string): ApprovalMode {
  return institutionPolicy.approvalModeByActionType[actionType] ?? "ALWAYS_CONFIRM";
}

/**
 * Given the actor context, action type, and (for automation) whether this
 * proposal originated from a rule trigger, decide whether explicit human
 * confirmation is required. High-risk and sensitive-write actions are never
 * silently made autonomous (spec section 51: "High-risk actions must never
 * silently become autonomous").
 */
export function confirmationRequired(actionType: string, riskLevel: RiskLevel, ctx: ActorContext, affectedCount: number): boolean {
  if (riskLevel === "HIGH_RISK" || riskLevel === "SENSITIVE_WRITE") return true;
  if (riskLevel === "READ" || riskLevel === "PREPARE") return false;

  // LOW_RISK_WRITE: governed by institution policy / approval mode.
  const mode = approvalModeFor(actionType);
  switch (mode) {
    case "NEVER_AUTONOMOUS":
      return true;
    case "ALWAYS_CONFIRM":
      return true;
    case "CONFIRM_IF_BULK":
      return affectedCount > institutionPolicy.bulkConfirmationThreshold;
    case "PRE_APPROVED": {
      if (!ctx.isAutomatedTrigger) return false; // human-initiated low-risk writes may auto-execute per policy
      return affectedCount > institutionPolicy.maxAutonomousRecipients;
    }
  }
}
