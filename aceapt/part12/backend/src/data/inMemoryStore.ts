import { Repository } from './repository';
import { StudentState, InterventionDecision, InterventionExecution, InterventionOutcome, InterventionProfile } from '../domain/types';
import { SEED_STUDENTS } from './seed';

export class InMemoryRepository implements Repository {
  private students = new Map<string, StudentState>();
  private decisions = new Map<string, InterventionDecision>();
  private executions = new Map<string, InterventionExecution>();
  private outcomes = new Map<string, InterventionOutcome>();
  private profiles = new Map<string, InterventionProfile>();

  constructor() {
    for (const s of SEED_STUDENTS) this.students.set(s.studentId, structuredClone(s));
  }

  getStudentState(studentId: string): StudentState | null {
    return this.students.get(studentId) ?? null;
  }

  saveDecision(decision: InterventionDecision): void {
    this.decisions.set(decision.id, decision);
  }
  getDecision(decisionId: string): InterventionDecision | null {
    return this.decisions.get(decisionId) ?? null;
  }

  saveExecution(execution: InterventionExecution): void {
    this.executions.set(execution.id, execution);
  }
  getExecution(executionId: string): InterventionExecution | null {
    return this.executions.get(executionId) ?? null;
  }
  listExecutionsForStudent(studentId: string): InterventionExecution[] {
    return [...this.executions.values()]
      .filter(e => e.studentId === studentId)
      .sort((a, b) => new Date(b.startedAt ?? 0).getTime() - new Date(a.startedAt ?? 0).getTime());
  }

  saveOutcome(outcome: InterventionOutcome): void {
    this.outcomes.set(outcome.interventionId, outcome);
  }
  getOutcome(interventionId: string): InterventionOutcome | null {
    return this.outcomes.get(interventionId) ?? null;
  }
  listOutcomesForStudentAndType(studentId: string, type: string): InterventionOutcome[] {
    const executionIds = new Set(
      [...this.executions.values()].filter(e => e.studentId === studentId && e.type === type).map(e => e.id)
    );
    return [...this.outcomes.values()]
      .filter(o => executionIds.has(o.interventionId))
      .sort((a, b) => new Date(b.evaluatedAt).getTime() - new Date(a.evaluatedAt).getTime());
  }

  getProfile(studentId: string): InterventionProfile | null {
    return this.profiles.get(studentId) ?? null;
  }
  saveProfile(profile: InterventionProfile): void {
    this.profiles.set(profile.studentId, profile);
  }

  appendInterventionHistory(studentId: string, record: StudentState['interventionHistory'][number]): void {
    const state = this.students.get(studentId);
    if (!state) return;
    state.interventionHistory = [record, ...state.interventionHistory];
  }

  updateReadiness(studentId: string, readiness: number): void {
    const state = this.students.get(studentId);
    if (!state) return;
    state.readiness = readiness;
  }
}

// Singleton for the prototype's single-process in-memory store. A real
// deployment would inject a Repository implementation instead of importing
// a singleton — kept simple here since this only needs to survive one dev run.
export const repository = new InMemoryRepository();
