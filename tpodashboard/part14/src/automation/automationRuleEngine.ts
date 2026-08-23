import type { ActorContext } from "../types/action.types.js";
import type { ApprovalMode } from "../permissions/policyGuard.js";
import { actionEngine } from "../engine/actionEngine.js";
import { auditRepo } from "../db/actionStore.js";
import { genAuditId, nowIso } from "../util/ids.js";

export interface AutomationRule {
  id: string;
  institutionId: string;
  trigger: string; // e.g. "interview_result.published"
  condition?: (event: DomainEvent) => boolean;
  actionType: string;
  buildInput: (event: DomainEvent) => Record<string, unknown>;
  approvalMode: ApprovalMode;
  enabled: boolean;
  version: number;
}

export interface DomainEvent {
  type: string;
  institutionId: string;
  payload: Record<string, unknown>;
  /** The system/service-account identity recorded as the automation actor. */
  actingUserId: string;
}

/**
 * Automation rule engine (spec sections 50-52). Rules never execute a
 * sensitive/high-risk action autonomously — approvalMode NEVER_AUTONOMOUS /
 * ALWAYS_CONFIRM / CONFIRM_IF_BULK routes fall back to creating a
 * READY_FOR_CONFIRMATION action for a human to confirm; only PRE_APPROVED
 * low-risk actions under the configured safety limit run end-to-end without a
 * human click, and every run — autonomous or not — is fully audited with the
 * triggering rule id (spec section 52).
 */
class AutomationRuleEngine {
  private rules: AutomationRule[] = [];

  register(rule: AutomationRule) {
    this.rules.push(rule);
  }

  async handleEvent(event: DomainEvent): Promise<void> {
    const matching = this.rules.filter(
      (r) => r.enabled && r.institutionId === event.institutionId && r.trigger === event.type && (!r.condition || r.condition(event))
    );

    for (const rule of matching) {
      const ctx: ActorContext = {
        userId: event.actingUserId,
        institutionId: event.institutionId,
        role: "ADMIN", // system-acting identity; still subject to every permission/policy check the action defines
        sessionId: `automation:${rule.id}:${nowIso()}`,
        isAutomatedTrigger: true,
        automationRuleId: rule.id,
      };

      const input = rule.buildInput(event);

      try {
        const proposed = await actionEngine.proposeAction(rule.actionType, input, ctx);

        if (!proposed.confirmationRequired && proposed.status === "READY_FOR_CONFIRMATION") {
          // PRE_APPROVED and within safety limits: run end-to-end.
          await actionEngine.executeAction(proposed.id, ctx);
        }
        // else: left in READY_FOR_CONFIRMATION / CONFIRMED-pending for a human
        // to review in the AI Actions inbox — automation never force-confirms.

        auditRepo.append({
          id: genAuditId(),
          actionId: proposed.id,
          institutionId: event.institutionId,
          event: "AUTOMATION_RULE_FIRED",
          userId: ctx.userId,
          role: ctx.role,
          sessionId: ctx.sessionId,
          detail: { ruleId: rule.id, trigger: event.type, approvalMode: rule.approvalMode },
          createdAt: nowIso(),
        });
      } catch (err) {
        auditRepo.append({
          id: genAuditId(),
          actionId: "n/a",
          institutionId: event.institutionId,
          event: "AUTOMATION_RULE_FAILED",
          userId: ctx.userId,
          role: ctx.role,
          sessionId: ctx.sessionId,
          detail: { ruleId: rule.id, trigger: event.type, error: err instanceof Error ? err.message : String(err) },
          createdAt: nowIso(),
        });
      }
    }
  }

  list(institutionId: string): AutomationRule[] {
    return this.rules.filter((r) => r.institutionId === institutionId);
  }
}

export const automationRuleEngine = new AutomationRuleEngine();
