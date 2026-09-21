import { DomainName, Question, Skill } from '../../domain/types';
import {
  AnalyticsEvent,
  AnalyticsEventPublisher,
  DiagnosticSessionRepository,
  HistoricalSkillEvidence,
  QuestionQueryCriteria,
  QuestionRepository,
  SkillRepository,
  StudentRepository,
} from '../../domain/ports';
import { AdaptiveDiagnosticState } from '../../domain/state';

/**
 * NOTE: this in-memory repository set is for local development and testing
 * only. Each class below implements exactly one port from domain/ports.ts -
 * swap them out independently as you wire in real ACEAPT models, you do not
 * need to replace all of them at once.
 */

export class InMemoryQuestionRepository implements QuestionRepository {
  constructor(private readonly questionBank: Question[]) {}

  async findCandidates(criteria: QuestionQueryCriteria): Promise<Question[]> {
    return this.questionBank.filter((q) => {
      if (criteria.skillIds && !criteria.skillIds.includes(q.skillId)) return false;
      if (criteria.excludeQuestionIds?.includes(q.id)) return false;
      if (criteria.onlyValidated && !q.isValidated) return false;
      if (criteria.excludeFlagged && q.isFlagged) return false;
      return true;
    });
  }

  async getById(id: string): Promise<Question | null> {
    return this.questionBank.find((q) => q.id === id) ?? null;
  }

  /** Test/demo helper mirroring spec section 91 (bad-question protection). */
  setFlagged(id: string, flagged: boolean): void {
    const q = this.questionBank.find((q) => q.id === id);
    if (q) q.isFlagged = flagged;
  }
}

export class InMemorySkillRepository implements SkillRepository {
  constructor(private readonly skillList: Skill[]) {}

  async listSkills(domains?: DomainName[]): Promise<Skill[]> {
    return domains ? this.skillList.filter((s) => domains.includes(s.domain)) : this.skillList;
  }

  async getById(id: string): Promise<Skill | null> {
    return this.skillList.find((s) => s.id === id) ?? null;
  }
}

export class InMemoryStudentRepository implements StudentRepository {
  constructor(private readonly historyByStudent: Record<string, HistoricalSkillEvidence[]> = {}) {}

  async getStudentHistoricalEvidence(studentId: string): Promise<HistoricalSkillEvidence[]> {
    return this.historyByStudent[studentId] ?? [];
  }
}

export class InMemoryDiagnosticSessionRepository implements DiagnosticSessionRepository {
  private readonly store = new Map<string, AdaptiveDiagnosticState>();

  async create(state: AdaptiveDiagnosticState): Promise<void> {
    this.store.set(state.sessionId, state);
  }
  async save(state: AdaptiveDiagnosticState): Promise<void> {
    this.store.set(state.sessionId, state);
  }
  async get(sessionId: string): Promise<AdaptiveDiagnosticState | null> {
    return this.store.get(sessionId) ?? null;
  }
}

export class InMemoryAnalyticsEventPublisher implements AnalyticsEventPublisher {
  public readonly events: AnalyticsEvent[] = [];
  async publish(event: AnalyticsEvent): Promise<void> {
    this.events.push(event);
  }
}
