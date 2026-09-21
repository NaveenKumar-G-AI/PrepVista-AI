import {
  Formula,
  FormulaRelationship,
  FormulaStudentState,
  FormulaTrainingAttempt,
  FormulaTrainingSession,
} from '../types';

// ---------------------------------------------------------------------------
// Repository interfaces (ports). Implement these against Postgres/Prisma
// (see prisma/schema.prisma) or whatever ACEAPT already uses for
// persistence - the rest of this package only ever depends on these
// interfaces, never on a concrete database client.
// ---------------------------------------------------------------------------

export interface FormulaRepository {
  getFormula(formulaId: string): Promise<Formula | null>;
  listFormulas(filter?: { domain?: string; status?: Formula['status']; tenantId?: string }): Promise<Formula[]>;
  saveFormula(formula: Formula): Promise<void>;
  getRelationships(formulaId: string): Promise<FormulaRelationship[]>;
  saveRelationship(relationship: FormulaRelationship): Promise<void>;
}

export interface StudentStateRepository {
  getState(studentId: string, formulaId: string): Promise<FormulaStudentState | null>;
  saveState(state: FormulaStudentState): Promise<void>;
  listStatesForStudent(studentId: string): Promise<FormulaStudentState[]>;
}

export interface TrainingAttemptRepository {
  saveAttempt(attempt: FormulaTrainingAttempt): Promise<void>;
  listAttempts(studentId: string, filter?: { formulaId?: string }): Promise<FormulaTrainingAttempt[]>;
}

export interface TrainingSessionRepository {
  saveSession(session: FormulaTrainingSession): Promise<void>;
  getSession(sessionId: string): Promise<FormulaTrainingSession | null>;
}

// ---------------------------------------------------------------------------
// In-memory implementations.
//
// These exist so the engine is fully runnable and testable with zero
// external dependencies. They are NOT meant for production use (no
// persistence across restarts, no indexing, no multi-instance sharing) -
// swap in Postgres/Prisma-backed implementations of the same interfaces.
// See docs/INTEGRATION.md.
// ---------------------------------------------------------------------------

export class InMemoryFormulaRepository implements FormulaRepository {
  private formulas = new Map<string, Formula>();
  private relationships: FormulaRelationship[] = [];

  async getFormula(formulaId: string): Promise<Formula | null> {
    return this.formulas.get(formulaId) ?? null;
  }

  async listFormulas(filter?: { domain?: string; status?: Formula['status']; tenantId?: string }): Promise<Formula[]> {
    let all = Array.from(this.formulas.values());
    if (filter?.domain) all = all.filter((f) => f.domain === filter.domain);
    if (filter?.status) all = all.filter((f) => f.status === filter.status);
    if (filter?.tenantId !== undefined) {
      all = all.filter((f) => f.tenantId === filter.tenantId || f.tenantId === undefined);
    }
    return all;
  }

  async saveFormula(formula: Formula): Promise<void> {
    this.formulas.set(formula.formulaId, formula);
  }

  async getRelationships(formulaId: string): Promise<FormulaRelationship[]> {
    // Symmetric lookup: callers should not need to know which direction an
    // edge was originally stored in.
    return this.relationships.filter((r) => r.sourceFormulaId === formulaId || r.targetFormulaId === formulaId);
  }

  async saveRelationship(relationship: FormulaRelationship): Promise<void> {
    this.relationships.push(relationship);
  }
}

export class InMemoryStudentStateRepository implements StudentStateRepository {
  private states = new Map<string, FormulaStudentState>();

  private key(studentId: string, formulaId: string): string {
    return `${studentId}::${formulaId}`;
  }

  async getState(studentId: string, formulaId: string): Promise<FormulaStudentState | null> {
    return this.states.get(this.key(studentId, formulaId)) ?? null;
  }

  async saveState(state: FormulaStudentState): Promise<void> {
    this.states.set(this.key(state.studentId, state.formulaId), state);
  }

  async listStatesForStudent(studentId: string): Promise<FormulaStudentState[]> {
    return Array.from(this.states.values()).filter((s) => s.studentId === studentId);
  }
}

export class InMemoryTrainingAttemptRepository implements TrainingAttemptRepository {
  private attempts: FormulaTrainingAttempt[] = [];

  async saveAttempt(attempt: FormulaTrainingAttempt): Promise<void> {
    this.attempts.push(attempt);
  }

  async listAttempts(studentId: string, filter?: { formulaId?: string }): Promise<FormulaTrainingAttempt[]> {
    return this.attempts.filter(
      (a) => a.studentId === studentId && (!filter?.formulaId || a.formulaId === filter.formulaId),
    );
  }
}

export class InMemoryTrainingSessionRepository implements TrainingSessionRepository {
  private sessions = new Map<string, FormulaTrainingSession>();

  async saveSession(session: FormulaTrainingSession): Promise<void> {
    this.sessions.set(session.sessionId, session);
  }

  async getSession(sessionId: string): Promise<FormulaTrainingSession | null> {
    return this.sessions.get(sessionId) ?? null;
  }
}
