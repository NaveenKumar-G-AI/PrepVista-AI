import { StudentState, InterventionDecision, InterventionExecution, InterventionOutcome, InterventionProfile } from '../domain/types';

/**
 * Storage boundary for Feature 12. The prototype implementation
 * (inMemoryStore.ts) is intentionally swappable — nothing in engine/*.ts or
 * api/routes.ts talks to a database directly. Point a Postgres/Prisma (or
 * whatever the real PrepVista stack uses) implementation at this same
 * interface and the rest of Feature 12 doesn't change.
 */
export interface Repository {
  getStudentState(studentId: string): StudentState | null;

  saveDecision(decision: InterventionDecision): void;
  getDecision(decisionId: string): InterventionDecision | null;

  saveExecution(execution: InterventionExecution): void;
  getExecution(executionId: string): InterventionExecution | null;
  listExecutionsForStudent(studentId: string): InterventionExecution[];

  saveOutcome(outcome: InterventionOutcome): void;
  getOutcome(interventionId: string): InterventionOutcome | null;
  listOutcomesForStudentAndType(studentId: string, type: string): InterventionOutcome[];

  getProfile(studentId: string): InterventionProfile | null;
  saveProfile(profile: InterventionProfile): void;

  appendInterventionHistory(studentId: string, record: StudentState['interventionHistory'][number]): void;
  updateReadiness(studentId: string, readiness: number): void;
}
