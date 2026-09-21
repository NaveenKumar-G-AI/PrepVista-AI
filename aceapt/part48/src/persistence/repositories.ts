/**
 * §68: only two new entities are actually needed beyond what Feature 47/session state already
 * tracks — HintInteraction and HintOutcome — plus HintPreference for the optional student
 * setting in §25. Everything below is expressed as an interface first so the runtime store is
 * swappable: the in-memory implementations here are what this reference build actually runs on
 * (so `npm test` / `npm run dev` work with zero external services), and src/persistence/schema.prisma
 * is the reference shape for a real Postgres-backed implementation of the same interfaces.
 */

import { HintInteraction, HintOutcome, HintPreference } from "../domain/types";

export interface HintInteractionRepository {
  save(interaction: HintInteraction): Promise<void>;
  get(id: string): Promise<HintInteraction | undefined>;
  listForStep(sessionId: string, problemId: string, stepId: string): Promise<HintInteraction[]>;
  listForSession(sessionId: string): Promise<HintInteraction[]>;
  listForStudentSkill(studentId: string, problemIds: string[]): Promise<HintInteraction[]>;
}

export interface HintOutcomeRepository {
  save(outcome: HintOutcome): Promise<void>;
  get(interactionId: string): Promise<HintOutcome | undefined>;
  listForInteractions(interactionIds: string[]): Promise<HintOutcome[]>;
}

export interface HintPreferenceRepository {
  get(studentId: string): Promise<HintPreference | undefined>;
  upsert(pref: HintPreference): Promise<void>;
}

// -----------------------------------------------------------------------------------------
// In-memory implementations — the default runtime store for this reference build.
// -----------------------------------------------------------------------------------------

export class InMemoryHintInteractionRepository implements HintInteractionRepository {
  private byId = new Map<string, HintInteraction>();

  async save(interaction: HintInteraction): Promise<void> {
    this.byId.set(interaction.id, interaction);
  }
  async get(id: string): Promise<HintInteraction | undefined> {
    return this.byId.get(id);
  }
  async listForStep(sessionId: string, problemId: string, stepId: string): Promise<HintInteraction[]> {
    return [...this.byId.values()]
      .filter((i) => i.sessionId === sessionId && i.problemId === problemId && i.stepId === stepId)
      .sort((a, b) => a.shownAt.localeCompare(b.shownAt));
  }
  async listForSession(sessionId: string): Promise<HintInteraction[]> {
    return [...this.byId.values()].filter((i) => i.sessionId === sessionId).sort((a, b) => a.shownAt.localeCompare(b.shownAt));
  }
  async listForStudentSkill(studentId: string, problemIds: string[]): Promise<HintInteraction[]> {
    const set = new Set(problemIds);
    return [...this.byId.values()]
      .filter((i) => i.studentId === studentId && set.has(i.problemId))
      .sort((a, b) => a.shownAt.localeCompare(b.shownAt));
  }
}

export class InMemoryHintOutcomeRepository implements HintOutcomeRepository {
  private byInteractionId = new Map<string, HintOutcome>();

  async save(outcome: HintOutcome): Promise<void> {
    this.byInteractionId.set(outcome.interactionId, outcome);
  }
  async get(interactionId: string): Promise<HintOutcome | undefined> {
    return this.byInteractionId.get(interactionId);
  }
  async listForInteractions(interactionIds: string[]): Promise<HintOutcome[]> {
    return interactionIds.map((id) => this.byInteractionId.get(id)).filter((o): o is HintOutcome => !!o);
  }
}

export class InMemoryHintPreferenceRepository implements HintPreferenceRepository {
  private byStudentId = new Map<string, HintPreference>();

  async get(studentId: string): Promise<HintPreference | undefined> {
    return this.byStudentId.get(studentId);
  }
  async upsert(pref: HintPreference): Promise<void> {
    const existing = this.byStudentId.get(pref.studentId) ?? { studentId: pref.studentId };
    this.byStudentId.set(pref.studentId, { ...existing, ...pref });
  }
}
