import {
  ActionError,
  ALLOWED_TRANSITIONS,
  type ActionStatus,
  type ActorContext,
  type AiAction,
} from "../types/action.types.js";
import { actionRegistry } from "../registry/actionDefinition.js";
import { actionRepo, idempotencyRepo } from "../db/actionStore.js";
import { auditLog } from "./auditLogger.js";
import { genActionId, genIdempotencyKey, nowIso, addMinutesIso, stableHash } from "../util/ids.js";
import { confirmationRequired } from "../permissions/policyGuard.js";

const PREVIEW_VALIDITY_MINUTES = 5;

/**
 * ActionEngine implements the fixed pipeline from spec section 5:
 *
 *   Natural Language -> Intent -> Action Plan -> Permission Guard -> Policy
 *   Guard -> Impact Analyzer -> Action Preview -> Confirmation -> Action
 *   Executor -> Verification -> Audit -> Result
 *
 * This is the ONLY object in the system permitted to construct, mutate, or
 * transition an AiAction. Part 12 (the conversational layer) and Part 13
 * (proactive signals) both call into this class through the interface named
 * in spec section 70: proposeAction / validateAction / previewAction /
 * confirmAction / executeAction / getActionStatus / cancelAction. Neither of
 * them is allowed to skip a step.
 */
class ActionEngine {
  /**
   * HOSTILE REVIEW FIX (CRITICAL - concurrent duplicate execution):
   * The idempotency cache check in executeAction is check-then-act. Without a
   * lock, two concurrent calls (a double-tap, or two racing client retries)
   * can both observe "not yet cached" before either finishes writing the
   * cache entry, and both proceed to invoke the underlying service — a real
   * double-send. This map serializes concurrent executeAction calls that
   * share an idempotency key onto a single in-flight promise, so only one
   * actually reaches the underlying service; the other awaits and receives
   * the same result. See tests/hostileReview.test.ts.
   */
  private inFlightExecutions = new Map<string, Promise<AiAction>>();

  // ---- 1. PROPOSE ---------------------------------------------------------
  async proposeAction(actionType: string, rawInput: unknown, ctx: ActorContext): Promise<AiAction> {
    const def = actionRegistry.get(actionType);

    const parsed = def.inputSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new ActionError("INVALID_INPUT", `Invalid input for ${actionType}: ${parsed.error.message}`);
    }

    // institutionId is always taken from the authenticated actor context, never
    // from client input, closing the "cross-tenant action" attack path at the
    // earliest possible point.
    const action: AiAction = {
      id: genActionId(),
      institutionId: ctx.institutionId,
      userId: ctx.userId,
      sessionId: ctx.sessionId,
      actionType,
      riskLevel: def.baseRiskLevel,
      status: "PROPOSED",
      targetScope: {},
      input: parsed.data as Record<string, unknown>,
      confirmationRequired: false,
      idempotencyKey: genIdempotencyKey(ctx, actionType, parsed.data),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      isAutomatedTrigger: ctx.isAutomatedTrigger,
      automationRuleId: ctx.automationRuleId,
    };
    actionRepo.save(action);
    auditLog(action, "PROPOSED", ctx, { statusAfter: "PROPOSED", detail: { actionType } });

    return this.validateAction(action.id, ctx);
  }

  // ---- 2. VALIDATE (permission -> policy -> preconditions -> risk) --------
  async validateAction(actionId: string, ctx: ActorContext): Promise<AiAction> {
    const action = this.getOwnedOrThrow(actionId, ctx);
    const def = actionRegistry.get(action.actionType);

    this.transition(action, "VALIDATING", ctx);

    const perm = def.checkPermission(action.input, ctx);
    if (!perm.ok) {
      this.fail(action, `PERMISSION_DENIED: ${perm.reason}`, ctx);
      throw new ActionError("PERMISSION_DENIED", perm.reason ?? "Not permitted.");
    }

    const policy = await def.checkPolicy(action.input, ctx);
    if (!policy.ok) {
      this.fail(action, `POLICY_DENIED: ${policy.reason}`, ctx);
      throw new ActionError("POLICY_DENIED", policy.reason ?? "Blocked by institution policy.");
    }

    if (def.checkPreconditions) {
      const pre = await def.checkPreconditions(action.input, ctx);
      if (!pre.ok) {
        this.fail(action, `PRECONDITION_FAILED: ${pre.reason}`, ctx);
        throw new ActionError("PRECONDITION_FAILED", pre.reason ?? "Preconditions not met.");
      }
    }

    const riskLevel = def.computeRisk ? await def.computeRisk(action.input, ctx) : def.baseRiskLevel;
    action.riskLevel = riskLevel;

    // Build the preview now so we know the affected-record count for the
    // confirmation-required decision, then again (fresh) at confirm-time for
    // stale-data detection.
    const preview = await def.buildPreview(action.input, ctx);
    action.preview = preview;
    action.snapshotHash = stableHash(preview);
    action.expiresAt = addMinutesIso(nowIso(), PREVIEW_VALIDITY_MINUTES);

    const needsConfirmation = def.confirmationOverride
      ? await def.confirmationOverride(action.input, ctx, riskLevel)
      : confirmationRequired(action.actionType, riskLevel, ctx, preview.audienceCount ?? 1);
    action.confirmationRequired = needsConfirmation;

    this.transition(action, "READY_FOR_CONFIRMATION", ctx);
    auditLog(action, "VALIDATED", ctx, { detail: { riskLevel, confirmationRequired: needsConfirmation } });
    return actionRepo.get(action.id)!;
  }

  // ---- 3. PREVIEW (re-fetch, e.g. for UI refresh) --------------------------
  async previewAction(actionId: string, ctx: ActorContext): Promise<AiAction> {
    const action = this.getOwnedOrThrow(actionId, ctx);
    const def = actionRegistry.get(action.actionType);
    const preview = await def.buildPreview(action.input, ctx);
    action.preview = preview;
    action.snapshotHash = stableHash(preview);
    action.expiresAt = addMinutesIso(nowIso(), PREVIEW_VALIDITY_MINUTES);
    actionRepo.save(action);
    auditLog(action, "PREVIEWED", ctx);
    return actionRepo.get(action.id)!;
  }

  // ---- 4. CONFIRM -----------------------------------------------------------
  /**
   * The ONLY entry point that can move an action to CONFIRMED. This must be
   * called from an authenticated user's explicit UI action or an equivalent
   * authorized API call — see security/sanitize.ts for why no document, tool
   * result, or model-generated text can ever substitute for this call
   * (spec section 67: confirmation-spoofing defense).
   */
  async confirmAction(actionId: string, ctx: ActorContext): Promise<AiAction> {
    const action = this.getOwnedOrThrow(actionId, ctx);
    this.requireContinuityOrEscalation(action, ctx);
    this.reCheckPermission(action, ctx);

    if (action.status !== "READY_FOR_CONFIRMATION") {
      throw new ActionError("INVALID_STATE", `Cannot confirm an action in state ${action.status}.`);
    }
    if (!action.confirmationRequired) {
      throw new ActionError("NOT_CONFIRMABLE", "This action does not require confirmation; call executeAction directly.");
    }
    if (action.expiresAt && new Date(action.expiresAt).getTime() < Date.now()) {
      this.transition(action, "EXPIRED", ctx);
      throw new ActionError("STALE_CONFIRMATION", "This action preview is stale. Review again.");
    }

    // Stale-data revalidation (spec section 34): rebuild the preview and
    // compare against the hash the user actually confirmed against. If the
    // underlying data moved, force a fresh review rather than silently acting
    // on outdated numbers.
    const def = actionRegistry.get(action.actionType);
    const fresh = await def.buildPreview(action.input, ctx);
    const freshHash = stableHash(fresh);
    if (freshHash !== action.snapshotHash) {
      action.preview = fresh;
      action.snapshotHash = freshHash;
      action.expiresAt = addMinutesIso(nowIso(), PREVIEW_VALIDITY_MINUTES);
      actionRepo.save(action);
      auditLog(action, "STALE_DATA_DETECTED", ctx, { detail: { previousHash: action.snapshotHash, freshHash } });
      throw new ActionError(
        "STALE_DATA",
        "The underlying data changed since you reviewed this action. Please review the updated preview before confirming."
      );
    }

    action.confirmationAt = nowIso();
    this.transition(action, "CONFIRMED", ctx);
    auditLog(action, "CONFIRMED", ctx);
    return actionRepo.get(action.id)!;
  }

  // ---- 5. EXECUTE -----------------------------------------------------------
  async executeAction(actionId: string, ctx: ActorContext): Promise<AiAction> {
    const action = this.getOwnedOrThrow(actionId, ctx);
    this.requireContinuityOrEscalation(action, ctx);
    this.reCheckPermission(action, ctx);

    // Serialize concurrent executions sharing the same idempotency key
    // (see `inFlightExecutions` doc comment above). Any caller racing in
    // while another execution for the same key is in flight awaits that same
    // promise instead of independently invoking the underlying service.
    const key = action.idempotencyKey;
    const inFlight = this.inFlightExecutions.get(key);
    if (inFlight) {
      return inFlight;
    }
    const run = this.doExecute(action, ctx).finally(() => {
      this.inFlightExecutions.delete(key);
    });
    this.inFlightExecutions.set(key, run);
    return run;
  }

  private async doExecute(action: AiAction, ctx: ActorContext): Promise<AiAction> {
    // Idempotency short-circuit (spec section 28), checked again here under
    // the lock in case a *previous* (non-racing, already-completed) call
    // already populated the cache. This covers both: (a) the same action
    // record being executed twice — e.g. a network retry or an impatient
    // double-click arriving *after* the first call already moved the action
    // to a terminal status like SUCCEEDED, which would otherwise fail an
    // ordinary state check — and (b) a brand-new action record proposed
    // today with identical actor+type+input, which hashes to the same
    // idempotency key. Either way the caller gets back the one true result,
    // and the underlying service is never invoked twice.
    const cached = idempotencyRepo.get(action.idempotencyKey);
    if (cached) {
      action.result = cached.result;
      action.status = cached.status;
      action.executedAt = action.executedAt ?? nowIso();
      actionRepo.save(action);
      auditLog(action, "EXECUTION_DEDUPED", ctx, { detail: { idempotencyKey: action.idempotencyKey } });
      return actionRepo.get(action.id)!;
    }

    if (action.confirmationRequired && action.status !== "CONFIRMED") {
      throw new ActionError("NOT_CONFIRMED", "This action requires confirmation before it can execute.");
    }
    if (!action.confirmationRequired && action.status !== "READY_FOR_CONFIRMATION") {
      throw new ActionError("INVALID_STATE", `Cannot execute an action in state ${action.status}.`);
    }

    this.transition(action, "EXECUTING", ctx);
    auditLog(action, "EXECUTING", ctx);

    const def = actionRegistry.get(action.actionType);
    try {
      const result = await def.execute(action.input, ctx, action.idempotencyKey);
      action.result = result;
      action.executedAt = nowIso();

      const status = this.deriveOutcomeStatus(result);
      this.transition(action, status, ctx);
      idempotencyRepo.set(action.idempotencyKey, { status, result });
      auditLog(action, "EXECUTED", ctx, { detail: result });
      return actionRepo.get(action.id)!;
    } catch (err) {
      this.fail(action, err instanceof Error ? err.message : String(err), ctx);
      throw err;
    }
  }

  // ---- STATUS / CANCEL -------------------------------------------------------
  getActionStatus(actionId: string, ctx: ActorContext): AiAction {
    return this.getOwnedOrThrow(actionId, ctx);
  }

  async cancelAction(actionId: string, ctx: ActorContext): Promise<AiAction> {
    const action = this.getOwnedOrThrow(actionId, ctx);
    this.requireContinuityOrEscalation(action, ctx);
    const cancellableFrom: ActionStatus[] = ["PROPOSED", "VALIDATING", "READY_FOR_CONFIRMATION", "CONFIRMED"];
    if (!cancellableFrom.includes(action.status)) {
      throw new ActionError("INVALID_STATE", `Cannot cancel an action in state ${action.status}.`);
    }
    this.transition(action, "CANCELLED", ctx);
    auditLog(action, "CANCELLED", ctx);
    return actionRepo.get(action.id)!;
  }

  // ---- internals --------------------------------------------------------------
  private deriveOutcomeStatus(result: { detail?: { succeeded: number; failed: number; skipped: number; requested: number } }): ActionStatus {
    const d = result.detail;
    if (!d) return "SUCCEEDED";
    if (d.failed > 0 && d.succeeded > 0) return "PARTIALLY_SUCCEEDED";
    if (d.failed > 0 && d.succeeded === 0) return "FAILED";
    return "SUCCEEDED";
  }

  /**
   * HOSTILE REVIEW FIX (CRITICAL - permission inheritance):
   * getOwnedOrThrow only checks tenant isolation and (for students) record
   * ownership. It does NOT check whether the confirming/executing actor is
   * authorized for the action at all — so, prior to this fix, any TPO staff
   * member in the same institution could confirm or execute an action
   * *proposed by someone else*, including one proposed by a more broadly
   * scoped actor (e.g. a Department Coordinator confirming a TPO Head's
   * institution-wide bulk action, or one Placement Officer confirming
   * another's draft). Confirmation and execution now require either:
   *   (a) the same authenticated user who proposed the action, or
   *   (b) an actor with institution-wide authority (TPO_HEAD / ADMIN),
   *       who may knowingly confirm on behalf of their team.
   * See tests/hostileReview.test.ts.
   */
  private requireContinuityOrEscalation(action: AiAction, ctx: ActorContext) {
    if (ctx.userId === action.userId) return;
    if (ctx.role === "TPO_HEAD" || ctx.role === "ADMIN") return;
    throw new ActionError(
      "FORBIDDEN",
      "Only the user who proposed this action, or a TPO Head / Admin, may confirm, execute, or cancel it."
    );
  }

  /**
   * HOSTILE REVIEW FIX (CRITICAL - permission inheritance):
   * checkPermission was previously evaluated only once, in validateAction, at
   * propose time. If the confirming/executing actor's role or scope changed
   * between propose and confirm (e.g. reassigned, downgraded, or — for the
   * TPO_HEAD escalation path above — simply a different, less-privileged
   * actor than the code assumed), the original check no longer reflects
   * reality. Confirmation and execution now independently re-run the
   * action's own checkPermission against the CURRENT ctx.
   */
  private reCheckPermission(action: AiAction, ctx: ActorContext) {
    const def = actionRegistry.get(action.actionType);
    const perm = def.checkPermission(action.input, ctx);
    if (!perm.ok) {
      throw new ActionError("PERMISSION_DENIED", perm.reason ?? "Not permitted.");
    }
  }

  private getOwnedOrThrow(actionId: string, ctx: ActorContext): AiAction {
    const action = actionRepo.get(actionId);
    if (!action) throw new ActionError("NOT_FOUND", "Action not found.");
    if (action.institutionId !== ctx.institutionId) {
      // Cross-tenant access attempt. Do not leak existence details.
      throw new ActionError("NOT_FOUND", "Action not found.");
    }
    if (ctx.role === "STUDENT" && action.userId !== ctx.userId) {
      throw new ActionError("FORBIDDEN", "You do not have access to this action.");
    }
    return action;
  }

  private transition(action: AiAction, next: ActionStatus, ctx: ActorContext) {
    const allowed = ALLOWED_TRANSITIONS[action.status];
    if (!allowed.includes(next)) {
      throw new ActionError("ILLEGAL_TRANSITION", `Cannot move action from ${action.status} to ${next}.`);
    }
    const before = action.status;
    action.status = next;
    action.updatedAt = nowIso();
    actionRepo.save(action);
    if (before !== next) {
      auditLog(action, "STATUS_CHANGED", ctx, { statusBefore: before, statusAfter: next });
    }
  }

  private fail(action: AiAction, reason: string, ctx: ActorContext) {
    action.failureReason = reason;
    // FAILED is reachable from most active states; bypass the map for the
    // terminal-failure path but still record it as an explicit transition.
    const before = action.status;
    action.status = "FAILED";
    action.updatedAt = nowIso();
    actionRepo.save(action);
    auditLog(action, "FAILED", ctx, { statusBefore: before, statusAfter: "FAILED", detail: { reason } });
  }
}

export const actionEngine = new ActionEngine();
