// ============================================================================
// In-memory repository implementations.
//
// Default wiring for the prototype: no database required. Data lives only
// for the process lifetime. Every class here implements a port from
// ../ports.ts and can be swapped 1:1 for a persisted implementation without
// touching the engine or service layer.
// ============================================================================

import {
  KnowledgeState,
  RetrievalAttempt,
  RecallSession,
  ReactivationSession,
  ConceptDependency,
} from '../../domain/types';
import {
  KnowledgeStateRepository,
  RetrievalAttemptRepository,
  RecallSessionRepository,
  ReactivationSessionRepository,
  ConceptDependencyRepository,
} from '../ports';

function pairKey(studentId: string, conceptId: string): string {
  return `${studentId}::${conceptId}`;
}

export class InMemoryKnowledgeStateRepository implements KnowledgeStateRepository {
  private store = new Map<string, KnowledgeState>();

  async get(studentId: string, conceptId: string) {
    return this.store.get(pairKey(studentId, conceptId)) ?? null;
  }
  async upsert(state: KnowledgeState) {
    this.store.set(pairKey(state.studentId, state.conceptId), state);
  }
  async listByStudent(studentId: string) {
    return [...this.store.values()].filter(s => s.studentId === studentId);
  }
  async listAll() {
    return [...this.store.values()];
  }
}

export class InMemoryRetrievalAttemptRepository implements RetrievalAttemptRepository {
  private byId = new Map<string, RetrievalAttempt>();
  private byConcept = new Map<string, RetrievalAttempt[]>();

  async add(attempt: RetrievalAttempt) {
    this.byId.set(attempt.id, attempt);
    const k = pairKey(attempt.studentId, attempt.conceptId);
    const arr = this.byConcept.get(k) ?? [];
    arr.push(attempt);
    this.byConcept.set(k, arr);
  }
  async listByConcept(studentId: string, conceptId: string) {
    const arr = this.byConcept.get(pairKey(studentId, conceptId)) ?? [];
    return [...arr].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async get(id: string) {
    return this.byId.get(id) ?? null;
  }
}

export class InMemoryRecallSessionRepository implements RecallSessionRepository {
  private store = new Map<string, RecallSession>();
  async create(session: RecallSession) {
    this.store.set(session.id, session);
  }
  async update(session: RecallSession) {
    this.store.set(session.id, session);
  }
  async get(id: string) {
    return this.store.get(id) ?? null;
  }
}

export class InMemoryReactivationSessionRepository implements ReactivationSessionRepository {
  private store = new Map<string, ReactivationSession>();
  async create(session: ReactivationSession) {
    this.store.set(session.id, session);
  }
  async update(session: ReactivationSession) {
    this.store.set(session.id, session);
  }
  async get(id: string) {
    return this.store.get(id) ?? null;
  }
  async listActive(studentId: string, conceptId: string) {
    return [...this.store.values()].filter(
      s => s.studentId === studentId && s.conceptId === conceptId && s.outcome === 'in_progress'
    );
  }
}

export class InMemoryConceptDependencyRepository implements ConceptDependencyRepository {
  private prerequisitesOf = new Map<string, Set<string>>(); // conceptId -> its prerequisite ids
  private dependentsOf = new Map<string, Set<string>>();    // conceptId -> ids that depend on it

  async seed(deps: ConceptDependency[]) {
    for (const dep of deps) {
      this.prerequisitesOf.set(dep.conceptId, new Set(dep.prerequisiteIds));
      for (const prereqId of dep.prerequisiteIds) {
        const set = this.dependentsOf.get(prereqId) ?? new Set<string>();
        set.add(dep.conceptId);
        this.dependentsOf.set(prereqId, set);
      }
    }
  }
  async getPrerequisites(conceptId: string) {
    return [...(this.prerequisitesOf.get(conceptId) ?? [])];
  }
  async getDependents(conceptId: string) {
    return [...(this.dependentsOf.get(conceptId) ?? [])];
  }
}
