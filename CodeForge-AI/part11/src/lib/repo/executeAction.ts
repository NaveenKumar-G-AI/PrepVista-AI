import type { PoolClient } from "pg";
import { ActionType, IncidentInstance, IncidentTemplate } from "@/lib/engine/types";
import { applyAction } from "@/lib/engine/actions";
import { resolveEscalationLevel } from "@/lib/engine/escalation";
import { recordActionIfNew, recordEvent } from "./investigation";
import { updateIncidentInstance } from "./instance";

export interface ExecuteActionInput {
  template: IncidentTemplate;
  instance: IncidentInstance;
  ownerId: string;
  actionType: ActionType;
  targetServiceKey?: string;
  confirmed: boolean;
  idempotencyKey: string;
  /** Set when this action reveals a specific evidence-bearing artifact
   * (e.g. INSPECT_LOGS on a particular golden log line) — threaded through
   * to the event payload so scoring.ts's "cited AND actually inspected"
   * evidence-quality check has something real to match against. */
  evidenceKey?: string;
}

export interface ExecuteActionOutput {
  instance: IncidentInstance;
  narrative: string;
  wasNew: boolean;
}

/**
 * The engine's applyAction() is pure and side-effect-free, so it's safe to
 * recompute on every call including retries — ConfirmationRequiredError /
 * ActionNotDefinedError surface before any database write happens. Only the
 * persistence step (action_log + instance patch + event) needs the
 * idempotency guard, which lives at the DB unique-constraint level via
 * recordActionIfNew. On a genuine duplicate, neither the instance nor the
 * event log are touched a second time.
 */
export async function executeAction(client: PoolClient, input: ExecuteActionInput): Promise<ExecuteActionOutput> {
  const { template, instance, ownerId, actionType, targetServiceKey, confirmed, idempotencyKey } = input;

  const result = applyAction({ template, instance, actionType, targetServiceKey, confirmed });

  const { row, wasNew } = await recordActionIfNew(client, instance.id, ownerId, {
    actionType,
    targetServiceKey: targetServiceKey ?? null,
    idempotencyKey,
    params: { confirmed },
    result: { narrative: result.narrative, effect: result.effect },
    simMinutesAt: instance.simMinutesElapsed,
  });

  if (!wasNew) {
    const cachedNarrative = (row.result as { narrative?: string }).narrative ?? result.narrative;
    return { instance, narrative: cachedNarrative, wasNew: false };
  }

  const mitigatedAfter = result.instancePatch.mitigated ?? instance.mitigated;
  const minutesAfter = result.instancePatch.simMinutesElapsed ?? instance.simMinutesElapsed;
  const escalationLevel = resolveEscalationLevel(template, minutesAfter, mitigatedAfter);

  const updated = await updateIncidentInstance(client, instance.id, { ...result.instancePatch, escalationLevel });
  await recordEvent(
    client,
    instance.id,
    ownerId,
    actionType,
    {
      targetServiceKey: targetServiceKey ?? null,
      evidenceKey: input.evidenceKey,
      isMitigation: result.instancePatch.mitigated === true,
    },
    instance.simMinutesElapsed
  );

  return { instance: updated, narrative: result.narrative, wasNew: true };
}
