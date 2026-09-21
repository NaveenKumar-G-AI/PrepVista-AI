import { randomUUID } from "node:crypto";
import type { InterventionRecord, LearningAction, LearningEventRecord, PathVersion, Skill, SkillEvidenceRecord, StudentContext } from "../domain/types.js";
import type { AttemptSignal } from "../domain/stuckDetection.js";
import type { AttemptRecordInput, Store } from "./types.js";

export class InMemoryStore implements Store {
  private students = new Map<string, { context: StudentContext; name: string }>();
  private evidence = new Map<string, Map<string, SkillEvidenceRecord>>(); // studentId -> skillId -> record
  private attempts = new Map<string, (AttemptSignal & { skillId: string })[]>(); // studentId -> list
  private pathVersions = new Map<string, PathVersion[]>(); // studentId -> versions, ascending
  private actions = new Map<string, LearningAction[]>(); // studentId -> actions
  private interventions = new Map<string, InterventionRecord[]>(); // studentId -> interventions
  private events = new Map<string, LearningEventRecord[]>(); // studentId -> events

  constructor(private catalog: Skill[]) {}

  async getSkillCatalog(): Promise<Skill[]> {
    return this.catalog;
  }

  async getStudent(studentId: string): Promise<StudentContext | null> {
    return this.students.get(studentId)?.context ?? null;
  }

  async upsertStudent(context: StudentContext, name: string): Promise<void> {
    this.students.set(context.studentId, { context, name });
  }

  async getEvidenceForStudent(studentId: string): Promise<Map<string, SkillEvidenceRecord>> {
    return new Map(this.evidence.get(studentId) ?? []);
  }

  async upsertEvidence(evidence: SkillEvidenceRecord): Promise<void> {
    if (!this.evidence.has(evidence.studentId)) this.evidence.set(evidence.studentId, new Map());
    this.evidence.get(evidence.studentId)!.set(evidence.skillId, evidence);
  }

  async recordAttempt(studentId: string, input: AttemptRecordInput): Promise<void> {
    if (!this.attempts.has(studentId)) this.attempts.set(studentId, []);
    this.attempts.get(studentId)!.push({
      skillId: input.skillId,
      correct: input.correct,
      hintUsed: input.hintUsed,
      errorSignature: input.errorSignature,
      timeMs: input.timeMs,
      expectedTimeMs: input.expectedTimeMs,
      createdAt: new Date().toISOString(),
    });
  }

  async getRecentAttemptsBySkill(studentId: string, limit = 20): Promise<Map<string, AttemptSignal[]>> {
    const all = this.attempts.get(studentId) ?? [];
    const bySkill = new Map<string, AttemptSignal[]>();
    for (const a of all) {
      if (!bySkill.has(a.skillId)) bySkill.set(a.skillId, []);
      bySkill.get(a.skillId)!.push(a);
    }
    for (const [skillId, list] of bySkill) bySkill.set(skillId, list.slice(-limit));
    return bySkill;
  }

  async getLatestPathVersion(studentId: string): Promise<PathVersion | null> {
    const versions = this.pathVersions.get(studentId) ?? [];
    return versions.length ? versions[versions.length - 1] : null;
  }

  async listPathVersions(studentId: string): Promise<PathVersion[]> {
    return [...(this.pathVersions.get(studentId) ?? [])];
  }

  async savePathVersion(version: PathVersion): Promise<PathVersion> {
    if (!this.pathVersions.has(version.studentId)) this.pathVersions.set(version.studentId, []);
    const list = this.pathVersions.get(version.studentId)!;
    // Mirrors the Postgres implementation's atomic-numbering guarantee: the
    // true version number is len+1 at the moment of this (synchronous,
    // single-threaded) append, not whatever the caller guessed.
    const authoritative: PathVersion = { ...version, versionNumber: list.length + 1 };
    list.push(authoritative);
    return authoritative;
  }

  async createAction(action: LearningAction): Promise<LearningAction> {
    if (!this.actions.has(action.studentId)) this.actions.set(action.studentId, []);
    this.actions.get(action.studentId)!.push(action);
    return action;
  }

  async getAction(studentId: string, actionId: string): Promise<LearningAction | null> {
    return (this.actions.get(studentId) ?? []).find((a) => a.id === actionId) ?? null;
  }

  async listActions(studentId: string, status?: LearningAction["status"]): Promise<LearningAction[]> {
    const all = this.actions.get(studentId) ?? [];
    return status ? all.filter((a) => a.status === status) : [...all];
  }

  async transitionAction(studentId: string, actionId: string, newStatus: LearningAction["status"]): Promise<LearningAction> {
    const list = this.actions.get(studentId) ?? [];
    const action = list.find((a) => a.id === actionId);
    if (!action) throw new Error(`action ${actionId} not found for this student`);
    if (action.status === "COMPLETED" || action.status === "SKIPPED") {
      throw new Error(`action ${actionId} is in a terminal status (${action.status}) and cannot be transitioned`);
    }
    // Mirrors migrations/002_widen_action_transitions.sql exactly — keep in sync.
    const allowed =
      (newStatus === "IN_PROGRESS" && ["PENDING", "POSTPONED"].includes(action.status)) ||
      (newStatus === "COMPLETED" && action.status === "IN_PROGRESS") ||
      (newStatus === "POSTPONED" && ["PENDING", "IN_PROGRESS"].includes(action.status)) ||
      (newStatus === "SKIPPED" && ["PENDING", "POSTPONED", "IN_PROGRESS"].includes(action.status));
    if (!allowed) {
      throw new Error(`cannot transition action from ${action.status} to ${newStatus}`);
    }
    action.status = newStatus;
    const now = new Date().toISOString();
    if (newStatus === "IN_PROGRESS" && !action.startedAt) action.startedAt = now;
    if (newStatus === "COMPLETED") action.completedAt = now;
    return action;
  }

  async getInterventionsBySkill(studentId: string): Promise<Map<string, InterventionRecord[]>> {
    const all = this.interventions.get(studentId) ?? [];
    const bySkill = new Map<string, InterventionRecord[]>();
    for (const i of all) {
      if (!bySkill.has(i.skillId)) bySkill.set(i.skillId, []);
      bySkill.get(i.skillId)!.push(i);
    }
    return bySkill;
  }

  async recordIntervention(record: InterventionRecord): Promise<void> {
    if (!this.interventions.has(record.studentId)) this.interventions.set(record.studentId, []);
    this.interventions.get(record.studentId)!.push(record);
  }

  async appendEvent(event: LearningEventRecord): Promise<void> {
    if (!this.events.has(event.studentId)) this.events.set(event.studentId, []);
    this.events.get(event.studentId)!.push(event);
  }

  async getEvents(studentId: string, limit = 100): Promise<LearningEventRecord[]> {
    return (this.events.get(studentId) ?? []).slice(-limit);
  }
}

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}
