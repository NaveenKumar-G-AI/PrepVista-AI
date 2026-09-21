/**
 * Ports (in the hexagonal-architecture sense): the engine depends on these
 * interfaces only, never on a concrete database or ORM. This is how the
 * "do not create duplicate student/question/skill/scoring systems" rule
 * (spec section 4) is satisfied without literal access to your existing
 * ACEAPT codebase - you implement thin adapters over your real Student,
 * Question, Skill, and Response models that satisfy these interfaces.
 *
 * src/infra/repositories/InMemoryRepositories.ts implements all of these
 * for local development and the test suite. Replace them one at a time.
 */

import { CapabilityLabel, DomainName, Question, Skill, SkillId } from './types';
import { AdaptiveDiagnosticState } from './state';

export interface HistoricalSkillEvidence {
  skillId: SkillId;
  capabilityLabel: CapabilityLabel;
  confidenceLabel: 'low' | 'moderate' | 'high';
  asOf: string; // ISO-8601
  sourceDiagnosticId?: string;
}

/**
 * Adapt this to your existing student/history system (e.g. Feature 42's
 * output). Used only to seed initial ability estimates with a wide-open
 * uncertainty (spec sections 41-43) - it never overrides fresh evidence.
 */
export interface StudentRepository {
  getStudentHistoricalEvidence(studentId: string): Promise<HistoricalSkillEvidence[]>;
}

export interface QuestionQueryCriteria {
  domains?: DomainName[];
  skillIds?: SkillId[];
  excludeQuestionIds?: string[];
  onlyValidated?: boolean;
  excludeFlagged?: boolean;
}

/**
 * Adapt this to your existing question bank. The engine only ever asks for
 * SELECTION metadata (difficulty, tags, validation/quality flags) - it never
 * reads or grades the question's actual content (see Question.content).
 */
export interface QuestionRepository {
  findCandidates(criteria: QuestionQueryCriteria): Promise<Question[]>;
  getById(questionId: string): Promise<Question | null>;
}

/** Adapt this to your existing skill/topic/domain taxonomy. */
export interface SkillRepository {
  listSkills(domains?: DomainName[]): Promise<Skill[]>;
  getById(skillId: SkillId): Promise<Skill | null>;
}

/**
 * Persistence for the live adaptive session. A real adapter should map this
 * onto the AdaptiveDiagnosticSession / AdaptiveSkillEvidence / AdaptiveDecisionLog
 * tables in prisma/schema.prisma (or your own equivalent) - see spec section 61.
 */
export interface DiagnosticSessionRepository {
  create(state: AdaptiveDiagnosticState): Promise<void>;
  save(state: AdaptiveDiagnosticState): Promise<void>;
  get(sessionId: string): Promise<AdaptiveDiagnosticState | null>;
}

export interface AnalyticsEvent {
  name: string; // e.g. 'diagnostic_started' (spec section 72)
  sessionId: string;
  studentId: string;
  properties?: Record<string, unknown>;
  timestamp: string;
}

export interface AnalyticsEventPublisher {
  publish(event: AnalyticsEvent): Promise<void>;
}

export interface Clock {
  now(): Date;
}

/** Values in [0, 1). Use a seeded implementation for reproducible tests (spec section 90). */
export interface RandomSource {
  next(): number;
}
