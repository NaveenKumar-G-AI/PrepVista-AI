// ============================================================================
// Repository ports.
//
// Everything in src/engine and src/services depends only on these
// interfaces, never on a concrete storage technology. The prototype ships
// in-memory implementations (src/repositories/memory) so it runs with zero
// config. To persist for real, implement these same interfaces against
// Postgres/Prisma (see prisma/schema.prisma) or whatever ACEAPT's existing
// data layer is, and swap the class at the composition root
// (src/api/server.ts / src/demo/judgeDemo.ts) — nothing else changes.
// ============================================================================

import {
  KnowledgeState,
  RetrievalAttempt,
  RecallSession,
  ReactivationSession,
  ConceptDependency,
} from '../domain/types';

export interface KnowledgeStateRepository {
  get(studentId: string, conceptId: string): Promise<KnowledgeState | null>;
  upsert(state: KnowledgeState): Promise<void>;
  listByStudent(studentId: string): Promise<KnowledgeState[]>;
  /** Used by cross-student observability only. */
  listAll(): Promise<KnowledgeState[]>;
}

export interface RetrievalAttemptRepository {
  add(attempt: RetrievalAttempt): Promise<void>;
  listByConcept(studentId: string, conceptId: string): Promise<RetrievalAttempt[]>;
  get(id: string): Promise<RetrievalAttempt | null>;
}

export interface RecallSessionRepository {
  create(session: RecallSession): Promise<void>;
  update(session: RecallSession): Promise<void>;
  get(id: string): Promise<RecallSession | null>;
}

export interface ReactivationSessionRepository {
  create(session: ReactivationSession): Promise<void>;
  update(session: ReactivationSession): Promise<void>;
  get(id: string): Promise<ReactivationSession | null>;
  listActive(studentId: string, conceptId: string): Promise<ReactivationSession[]>;
}

export interface ConceptDependencyRepository {
  /** Concepts that list `conceptId` as one of their prerequisites. */
  getDependents(conceptId: string): Promise<string[]>;
  getPrerequisites(conceptId: string): Promise<string[]>;
  seed(deps: ConceptDependency[]): Promise<void>;
}
