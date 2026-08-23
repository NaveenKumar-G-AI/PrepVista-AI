/**
 * Core types for the PrepVista AI Action Engine (Part 14).
 *
 * These types intentionally mirror the persistent `ai_action` abstraction and
 * the fixed state machine described in the Part 14 spec (sections 6-7).
 * Nothing outside `ActionEngine` is permitted to construct or mutate an
 * `AiAction` directly — see engine/actionEngine.ts.
 */

export type RiskLevel =
  | "READ" // LEVEL 0 - no side effect
  | "PREPARE" // LEVEL 1 - draft/preview only, no consequential state change
  | "LOW_RISK_WRITE" // LEVEL 2 - low-impact internal write, may auto-execute per policy
  | "SENSITIVE_WRITE" // LEVEL 3 - requires explicit confirmation
  | "HIGH_RISK"; // LEVEL 4 - requires strong authorization + explicit confirmation

export const RISK_ORDER: RiskLevel[] = [
  "READ",
  "PREPARE",
  "LOW_RISK_WRITE",
  "SENSITIVE_WRITE",
  "HIGH_RISK",
];

export type ActionStatus =
  | "PROPOSED"
  | "VALIDATING"
  | "READY_FOR_CONFIRMATION"
  | "CONFIRMED"
  | "EXECUTING"
  | "SUCCEEDED"
  | "PARTIALLY_SUCCEEDED"
  | "FAILED"
  | "CANCELLED"
  | "EXPIRED";

/** Legal status transitions. Any transition not listed here is rejected. */
export const ALLOWED_TRANSITIONS: Record<ActionStatus, ActionStatus[]> = {
  PROPOSED: ["VALIDATING", "FAILED", "CANCELLED"],
  VALIDATING: ["READY_FOR_CONFIRMATION", "FAILED", "CANCELLED"],
  READY_FOR_CONFIRMATION: ["CONFIRMED", "EXECUTING", "EXPIRED", "CANCELLED", "READY_FOR_CONFIRMATION"],
  CONFIRMED: ["EXECUTING", "EXPIRED", "CANCELLED"],
  EXECUTING: ["SUCCEEDED", "PARTIALLY_SUCCEEDED", "FAILED"],
  SUCCEEDED: [],
  PARTIALLY_SUCCEEDED: [],
  FAILED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export type UserRole =
  | "TPO_HEAD"
  | "PLACEMENT_OFFICER"
  | "DEPARTMENT_COORDINATOR"
  | "STUDENT"
  | "MANAGEMENT"
  | "ADMIN";

/**
 * Identity + scope of the human (or, for automation, the system-on-behalf-of-rule)
 * initiating an action. This is always derived from the authenticated session on
 * the backend — the action engine NEVER trusts a role or scope submitted by the
 * client or inferred by the LLM (spec section 24).
 */
export interface ActorContext {
  userId: string;
  institutionId: string;
  role: UserRole;
  /** Department Coordinator scope restriction. Absent/empty = no department restriction (e.g. TPO_HEAD). */
  departments?: string[];
  /** Present only for STUDENT role: the student's own record id. Students can never act on another student. */
  studentId?: string;
  sessionId: string;
  /** Set by the automation rule engine when an action is proposed by a rule rather than a human. */
  isAutomatedTrigger?: boolean;
  automationRuleId?: string;
}

export interface ActionResultDetail {
  requested: number;
  succeeded: number;
  failed: number;
  skipped: number;
  errors: Array<{ target: string; reason: string }>;
}

export interface ActionResult {
  summary: string;
  detail?: ActionResultDetail;
  raw?: unknown;
}

export interface ActionPreview {
  headline: string;
  audienceCount?: number;
  audienceBreakdown?: Record<string, number>;
  channel?: string;
  schedule?: string;
  message?: string;
  diff?: Array<{ target: string; from: string; to: string }>;
  irreversible: boolean;
  extra?: Record<string, unknown>;
}

export interface AiAction {
  id: string;
  institutionId: string;
  userId: string;
  sessionId: string;
  actionType: string;
  riskLevel: RiskLevel;
  status: ActionStatus;
  targetScope: Record<string, unknown>;
  input: Record<string, unknown>;
  preview?: ActionPreview;
  confirmationRequired: boolean;
  confirmationAt?: string;
  executedAt?: string;
  result?: ActionResult;
  failureReason?: string;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
  /** Confirmation preview validity window (spec section 33). */
  expiresAt?: string;
  /** Hash of the last-built preview, used for stale-data detection (spec section 34). */
  snapshotHash?: string;
  isAutomatedTrigger?: boolean;
  automationRuleId?: string;
}

export class ActionError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = "ActionError";
  }
}

export interface AuditEntry {
  id: string;
  actionId: string;
  institutionId: string;
  event: string;
  userId: string;
  role: UserRole;
  sessionId: string;
  statusBefore?: ActionStatus;
  statusAfter?: ActionStatus;
  detail?: unknown;
  createdAt: string;
}
