import type { z } from "zod";
import type { ActionPreview, ActionResult, ActorContext, RiskLevel } from "../types/action.types.js";

export interface PreconditionCheck {
  ok: boolean;
  reason?: string;
}

/**
 * Every action the AI can propose must be a statically registered
 * ActionDefinition. There is no path from natural language to a database
 * mutation that does not go through one of these (spec sections 43-44:
 * "No direct SQL actions", "No arbitrary tool chaining"). The LLM's only job is
 * to pick an actionType + fill in its typed input; every other decision
 * (permission, policy, risk, preview, execution) is owned by this definition
 * and the engine that drives it.
 */
export interface ActionDefinition<TInput = any> {
  actionType: string;
  category:
    | "STUDENT"
    | "DRIVE"
    | "APPLICATION"
    | "INTERVIEW"
    | "OFFER"
    | "JOINING"
    | "TRAINING"
    | "INTERVENTION"
    | "COMMUNICATION"
    | "REPORT"
    | "TASK"
    | "RECRUITER_FOLLOWUP"
    | "DATA_QUALITY";
  description: string;
  baseRiskLevel: RiskLevel;
  inputSchema: z.ZodType<TInput, any, any>;

  /** Coarse + fine-grained authorization. Never trusts ctx fields that didn't come from the authenticated session. */
  checkPermission: (input: TInput, ctx: ActorContext) => PreconditionCheck;

  /** Institution / module policy checks (bulk limits, opt-outs, workflow rules owned by Parts 3-11). */
  checkPolicy: (input: TInput, ctx: ActorContext) => Promise<PreconditionCheck> | PreconditionCheck;

  /** Entity-state preconditions (e.g. "all results must be reviewed before publish"). AI must never guess-fix a missing precondition (spec section 54). */
  checkPreconditions?: (input: TInput, ctx: ActorContext) => Promise<PreconditionCheck> | PreconditionCheck;

  /** Optional dynamic risk recomputation based on actual scope size (spec section 55: one draft note vs 500 status changes). */
  computeRisk?: (input: TInput, ctx: ActorContext) => Promise<RiskLevel> | RiskLevel;

  /** Optional dynamic override of whether confirmation is required, given actual affected-record count. Defaults to policyGuard.confirmationRequired. */
  confirmationOverride?: (input: TInput, ctx: ActorContext, riskLevel: RiskLevel) => Promise<boolean> | boolean;

  /** Builds the human-readable preview shown before confirmation. Must be idempotent and side-effect free (dry-run). */
  buildPreview: (input: TInput, ctx: ActorContext) => Promise<ActionPreview> | ActionPreview;

  /**
   * Executes through the real Part 3-11 service (here, the services/ stubs).
   * Must be safe to call at most once per idempotencyKey — the engine
   * guarantees it will not call this twice for the same key, but well-behaved
   * actions pass the key through to the underlying service as defense in depth.
   */
  execute: (input: TInput, ctx: ActorContext, idempotencyKey: string) => Promise<ActionResult>;

  /** Optional rollback for reversible actions (draft cancel, revertible metadata). Irreversible actions omit this and must say so in their preview. */
  rollback?: (input: TInput, ctx: ActorContext, result: ActionResult) => Promise<void>;
}

class ActionRegistry {
  private defs = new Map<string, ActionDefinition<any>>();

  register<T>(def: ActionDefinition<T>): void {
    if (this.defs.has(def.actionType)) {
      throw new Error(`Duplicate action registration: ${def.actionType}`);
    }
    this.defs.set(def.actionType, def);
  }

  get(actionType: string): ActionDefinition<any> {
    const def = this.defs.get(actionType);
    if (!def) {
      throw new Error(`UNKNOWN_ACTION: ${actionType}`);
    }
    return def;
  }

  has(actionType: string): boolean {
    return this.defs.has(actionType);
  }

  list(): ActionDefinition<any>[] {
    return [...this.defs.values()];
  }
}

export const actionRegistry = new ActionRegistry();
