import {
  ActionDefinition,
  ActionType,
  IncidentInstance,
  IncidentState,
  IncidentTemplate,
} from "./types";
import { resolveNextState } from "./stateMachine";

export class ActionNotDefinedError extends Error {
  constructor(actionType: string, targetServiceKey?: string) {
    super(
      `Action ${actionType}${targetServiceKey ? ` on ${targetServiceKey}` : ""} is not defined for this incident template`
    );
    this.name = "ActionNotDefinedError";
  }
}

export class ConfirmationRequiredError extends Error {
  constructor(public actionType: ActionType) {
    super(`${actionType} is a dangerous action and requires explicit confirmation`);
    this.name = "ConfirmationRequiredError";
  }
}

export interface ApplyActionInput {
  template: IncidentTemplate;
  instance: IncidentInstance;
  actionType: ActionType;
  targetServiceKey?: string;
  confirmed: boolean;
}

export interface ApplyActionResult {
  /** Patch to persist onto the incidents row. */
  instancePatch: Partial<
    Pick<
      IncidentInstance,
      "state" | "simMinutesElapsed" | "mitigated" | "permanentFixApplied" | "verified"
    >
  >;
  narrative: string;
  /** What actually happened, safe to show the student immediately. */
  effect: {
    metricShifts: { metricName: string; serviceKey: string; deltaPct: number }[];
    resolvedNewState: IncidentState;
  };
}

function findActionDef(
  template: IncidentTemplate,
  actionType: ActionType,
  targetServiceKey?: string
): ActionDefinition {
  const def = template.actionDefs.find(
    (a) => a.actionType === actionType && (a.targetServiceKey ?? undefined) === (targetServiceKey ?? undefined)
  );
  if (!def) throw new ActionNotDefinedError(actionType, targetServiceKey);
  return def;
}

/**
 * Pure function: given ground truth + current instance state, resolve what
 * executing this action does. Callers are responsible for idempotency
 * (checking incident_action_log for an existing row with the same
 * idempotency_key before calling this) and for persisting the result.
 *
 * Throws ConfirmationRequiredError for DANGEROUS actions when `confirmed`
 * is false — the caller should surface a confirm/cancel prompt and retry
 * with confirmed=true rather than silently proceeding.
 */
export function applyAction(input: ApplyActionInput): ApplyActionResult {
  const { template, instance, actionType, targetServiceKey, confirmed } = input;
  const def = findActionDef(template, actionType, targetServiceKey);

  if (def.requiresConfirmation && !confirmed) {
    throw new ConfirmationRequiredError(actionType);
  }

  if (actionType === "RUN_TESTS" && !instance.permanentFixApplied) {
    return {
      instancePatch: { simMinutesElapsed: instance.simMinutesElapsed + def.simMinutesCost },
      narrative: "The simulated query-performance test still detects the missing-index problem. Apply a permanent fix before using this test as evidence of recovery.",
      effect: { metricShifts: [], resolvedNewState: instance.state },
    };
  }

  // VERIFY_SERVICE is a read of reality, not a wish: it can only actually
  // move the incident to RESOLVED if something real already stopped the
  // bleeding. Otherwise it truthfully reports "still degraded" and costs
  // time without advancing state — see brief: "Student resolves incident.
  // Expected: verification required before resolution."
  if (actionType === "VERIFY_SERVICE" && !instance.mitigated && !instance.permanentFixApplied) {
    return {
      instancePatch: { simMinutesElapsed: instance.simMinutesElapsed + def.simMinutesCost },
      narrative:
        "Metrics are still degraded — error rate and latency have not recovered. Verification requires the incident to be mitigated or fixed first.",
      effect: { metricShifts: [], resolvedNewState: instance.state },
    };
  }

  // The original API advanced investigation separately. The standalone action
  // flow owns those transitions, while keeping each step valid in the table.
  let currentState = instance.state;
  if (currentState === 'ACTIVE') currentState = resolveNextState(currentState, 'INVESTIGATING');
  if (actionType === 'VERIFY_SERVICE' && (instance.mitigated || instance.permanentFixApplied)) {
    currentState = resolveNextState(currentState, 'VERIFYING');
  }
  const nextState = resolveNextState(currentState, def.consequence.advancesStateTo);

  const instancePatch: ApplyActionResult["instancePatch"] = {
    state: nextState,
    simMinutesElapsed: instance.simMinutesElapsed + def.simMinutesCost,
  };
  if (def.consequence.setMitigated) instancePatch.mitigated = true;
  if (def.consequence.setPermanentFixApplied) instancePatch.permanentFixApplied = true;
  if (def.consequence.setVerified) instancePatch.verified = true;

  return {
    instancePatch,
    narrative: def.consequence.narrative,
    effect: {
      metricShifts: def.consequence.setMetricShift ?? [],
      resolvedNewState: nextState,
    },
  };
}

/** Public (pre-evaluation) view of an action def — strips hidden judgment fields. */
export function toPublicActionDef(def: ActionDefinition) {
  return {
    actionType: def.actionType,
    targetServiceKey: def.targetServiceKey,
    risk: def.risk,
    requiresConfirmation: def.requiresConfirmation,
    simMinutesCost: def.simMinutesCost,
    description: def.description,
    expectedEffect: def.expectedEffect,
  };
}
