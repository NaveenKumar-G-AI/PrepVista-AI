import { BehaviorEvent, BehaviorEventType } from '../types/events';

export interface EventQuery {
  studentId: string;
  types?: BehaviorEventType[];
  sinceUtc?: string;
}

/**
 * The one interface every layer above it depends on (aggregation, signal
 * detectors, controllers). To plug in a real database, write a class that
 * implements this and swap it in src/infrastructure/store.ts - nothing
 * else in the codebase needs to change. See infrastructure/inMemoryEventStore.ts
 * for the current (in-memory, prototype-only) implementation.
 */
export interface EventStore {
  append(event: BehaviorEvent): Promise<BehaviorEvent>;
  query(query: EventQuery): Promise<BehaviorEvent[]>;
  allStudentIds(): Promise<string[]>;
  /** Powers cross-student content-friction analysis (section 13/14). */
  queryByQuestion(questionId: string): Promise<BehaviorEvent[]>;
}
