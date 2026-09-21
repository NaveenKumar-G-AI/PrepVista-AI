import type { LearningAction } from "../domain/types.js";
import type { Store } from "../repositories/types.js";
import { newId } from "../repositories/inMemoryStore.js";
import { detectStuck, countAbandonments } from "../domain/stuckDetection.js";
import { selectNextIntervention } from "../domain/interventionEngine.js";
import { makeEvent, NotFoundError, InvalidTransitionError } from "./events.js";

export class LearningActionService {
  constructor(private store: Store) {}

  async get(studentId: string, actionId: string): Promise<LearningAction> {
    const action = await this.store.getAction(studentId, actionId);
    if (!action) throw new NotFoundError(`action ${actionId} not found`);
    return action;
  }

  async start(studentId: string, actionId: string): Promise<LearningAction> {
    const action = await this.transition(studentId, actionId, "IN_PROGRESS");
    await this.store.appendEvent(makeEvent(studentId, "ACTION_STARTED", action.skillId, action.id));
    return action;
  }

  async complete(studentId: string, actionId: string, resultingEvidenceSummary?: string): Promise<LearningAction> {
    const action = await this.transition(studentId, actionId, "COMPLETED");
    await this.store.appendEvent(makeEvent(studentId, "ACTION_COMPLETED", action.skillId, action.id, { resultingEvidenceSummary: resultingEvidenceSummary ?? null }));
    if (action.actionType === "RETEST" || action.interventionType === "VERIFICATION") {
      await this.store.appendEvent(makeEvent(studentId, "VERIFICATION_COMPLETED", action.skillId, action.id));
    }
    return action;
  }

  async postpone(studentId: string, actionId: string): Promise<LearningAction> {
    const action = await this.transition(studentId, actionId, "POSTPONED");
    await this.store.appendEvent(makeEvent(studentId, "ACTION_POSTPONED", action.skillId, action.id));
    return action;
  }

  async skip(studentId: string, actionId: string): Promise<LearningAction> {
    const action = await this.transition(studentId, actionId, "SKIPPED");
    await this.store.appendEvent(makeEvent(studentId, "ACTION_SKIPPED", action.skillId, action.id));
    return action;
  }

  /**
   * Phase 16/49: checks the student's recent attempt pattern for this skill
   * and, if stuck, records the next escalation-sequence intervention rather
   * than letting the caller just queue more of the same questions.
   */
  async requestVerification(studentId: string, actionId: string): Promise<{ action: LearningAction; stuck: boolean; interventionAssigned: string | null }> {
    const action = await this.get(studentId, actionId);
    const recentAttempts = await this.store.getRecentAttemptsBySkill(studentId);
    const events = await this.store.getEvents(studentId);
    const stuck = detectStuck(recentAttempts.get(action.skillId) ?? [], countAbandonments(events, action.skillId));

    let interventionAssigned: string | null = null;
    if (stuck.isStuck) {
      const priorBySkill = await this.store.getInterventionsBySkill(studentId);
      const priorForSkill = priorBySkill.get(action.skillId) ?? [];
      const nextType = selectNextIntervention(priorForSkill);
      await this.store.recordIntervention({
        id: newId("intervention"),
        studentId,
        skillId: action.skillId,
        type: nextType,
        reason: `Stuck signal detected (${stuck.signalType}) while requesting verification.`,
        sequenceIndex: priorForSkill.length,
        createdAt: new Date().toISOString(),
        outcomeImproved: null,
      });
      await this.store.appendEvent(makeEvent(studentId, "INTERVENTION_CHANGED", action.skillId, action.id, { type: nextType }));
      interventionAssigned = nextType;
    }

    return { action, stuck: stuck.isStuck, interventionAssigned };
  }

  private async transition(studentId: string, actionId: string, newStatus: LearningAction["status"]): Promise<LearningAction> {
    try {
      return await this.store.transitionAction(studentId, actionId, newStatus);
    } catch (err: any) {
      if (/not found/i.test(err.message)) throw new NotFoundError(err.message);
      throw new InvalidTransitionError(err.message); // e.g. completing a PENDING action — a rejected request, not a 500
    }
  }
}
