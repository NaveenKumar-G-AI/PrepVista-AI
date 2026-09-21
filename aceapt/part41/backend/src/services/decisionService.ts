import type { ID, DecisionRecord } from '../types/domain.js';
import type { StrategyStore, ContextSourceRepository } from '../repositories/types.js';
import { buildStrategyContext } from '../engines/contextBuilder.js';
import { detectContradiction } from '../engines/guardEngines.js';
import { eventBus } from '../events/eventBus.js';
import type { ContradictionFlag } from '../types/strategy.js';

export interface DecisionSubmission {
  studentId: ID;
  question: string;
  optionsConsidered: string[];
  chosenOption: string;
  impliedTargetRole?: string;
}

export interface DecisionResult {
  decision: DecisionRecord;
  contradiction: ContradictionFlag;
  strategyChange: {
    detected: boolean;
    previousTargetRole?: string;
    proposedTargetRole?: string;
    requiresConfirmation: boolean;
  };
}

/**
 * spec #17-18, #33-34, #77-78: records a decision, checks it against the
 * declared priorities for a soft contradiction, and — critically — NEVER
 * silently applies a major strategy change. If the decision implies a
 * different target role than the current strategy version, this returns
 * strategyChange.requiresConfirmation = true and does NOT create a new
 * strategy version. Call confirmStrategyChange() separately once the
 * student has explicitly confirmed (spec #78).
 */
export async function recordDecision(
  submission: DecisionSubmission,
  sources: ContextSourceRepository,
  store: StrategyStore,
  persistDecision: (d: DecisionSubmission) => Promise<DecisionRecord>,
): Promise<DecisionResult> {
  const decision = await persistDecision(submission);
  eventBus.publish('decision_created', { studentId: submission.studentId, decisionId: decision.id });

  const ctx = await buildStrategyContext(submission.studentId, sources, store);
  const contradiction = detectContradiction({ ...ctx, recentDecisions: [...ctx.recentDecisions, decision] });

  const currentTarget = ctx.currentVersion?.targetRole ?? ctx.goal?.targetRole;
  const impliedTarget = submission.impliedTargetRole;
  const strategyChangeDetected = !!impliedTarget && !!currentTarget && normalizeRole(impliedTarget) !== normalizeRole(currentTarget);

  return {
    decision,
    contradiction,
    strategyChange: {
      detected: strategyChangeDetected,
      previousTargetRole: currentTarget,
      proposedTargetRole: impliedTarget,
      requiresConfirmation: strategyChangeDetected,
    },
  };
}

export interface StrategyChangeConfirmation {
  strategyId: ID;
  newTargetRole: string;
  newGoalId: ID | null;
  reason: string;
  assumptions: string[];
}

/** spec #78: only called after the student has explicitly clicked "Confirm
 * strategy change" on the comparison screen (current vs proposed, evidence,
 * tradeoffs, switching cost, unknowns). Creates strategy vN+1 (spec #19). */
export async function confirmStrategyChange(input: StrategyChangeConfirmation, store: StrategyStore) {
  const versions = await store.listVersions(input.strategyId);
  const nextVersionNumber = (versions.at(-1)?.versionNumber ?? 0) + 1;
  const currentVersion = await store.getCurrentVersion(input.strategyId);

  const version = await store.createVersion({
    strategyId: input.strategyId,
    versionNumber: nextVersionNumber,
    goalId: input.newGoalId,
    targetRole: input.newTargetRole,
    reason: input.reason,
    assumptions: input.assumptions,
    priorities: currentVersion?.priorities ?? {},
  });

  eventBus.publish('strategy_updated', { strategyId: input.strategyId, versionNumber: nextVersionNumber, targetRole: input.newTargetRole });
  return version;
}

function normalizeRole(role: string): string {
  return role.trim().toLowerCase();
}
