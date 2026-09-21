// ============================================================================
// Cross-feature integration ports.
//
// Feature 19 is not a question engine and not a mastery engine — it reads
// from those systems and writes evidence back to Readiness/Intervention.
// Every dependency on another feature is expressed as a small interface
// here. The mock classes at the bottom make the whole module runnable
// standalone; replace each one with a real client for that feature and
// wire it in at the composition root (src/api/server.ts, src/demo/judgeDemo.ts).
// Nothing in src/engine or src/services depends on the mocks directly.
// ============================================================================

import { DifficultyBand, RetrievalMode } from '../domain/types';

// ---- Feature 14: Mastery & Transfer Intelligence --------------------------
export interface MasteryRecord {
  masteredAt: string;
  masterySuccessRate: number;
}
export interface MasteryPort {
  getMasteryRecord(studentId: string, conceptId: string): Promise<MasteryRecord | null>;
}

// ---- Feature 17: Question Intelligence ------------------------------------
export interface QuestionRef {
  id: string;
  conceptId: string;
  templateId: string;
  difficultyBand: DifficultyBand;
  method: string;
  topicWrapper: string;
  prompt: string;
}
export interface QuestionQuery {
  conceptId: string;
  mode: RetrievalMode;
  difficulty?: DifficultyBand;
  timed?: boolean;
  excludeTemplateIds?: string[];
  contrastWithConceptIds?: string[];
  count?: number;
}
export interface QuestionPort {
  getQuestions(query: QuestionQuery): Promise<QuestionRef[]>;
}

// ---- Feature 13: Readiness Intelligence -----------------------------------
export interface PressureEvidence {
  untimedSuccessRate: number;
  timedSuccessRate: number;
  gap: number;
}
export interface ReadinessPort {
  reportPressureEvidence(studentId: string, conceptId: string, evidence: PressureEvidence): Promise<void>;
}

// ---- Feature 16: Intervention & Recovery ----------------------------------
export interface InterventionPort {
  escalate(studentId: string, conceptId: string, reason: string): Promise<void>;
}

// ---- Feature 18: Reasoning Intelligence (optional signal) -----------------
export interface ReasoningSignal {
  explanationDependency: number; // 0–1
}
export interface ReasoningPort {
  getReasoningSignal(studentId: string, conceptId: string): Promise<ReasoningSignal | null>;
}

/* ========================================================================
 * Mock implementations — replace each of these with a real client.
 * ==================================================================== */

export class MockMasteryPort implements MasteryPort {
  private records = new Map<string, MasteryRecord>();
  set(studentId: string, conceptId: string, record: MasteryRecord) {
    this.records.set(`${studentId}::${conceptId}`, record);
  }
  async getMasteryRecord(studentId: string, conceptId: string) {
    return this.records.get(`${studentId}::${conceptId}`) ?? null;
  }
}

let questionCounter = 0;
export class MockQuestionPort implements QuestionPort {
  async getQuestions(query: QuestionQuery): Promise<QuestionRef[]> {
    const count = query.count ?? 1;
    const methods = ['direct', 'unitary', 'algebraic'];
    const wrappers = ['shopping', 'sports', 'travel', 'finance'];
    return Array.from({ length: count }, (_, i) => {
      questionCounter += 1;
      return {
        id: `q_${questionCounter}`,
        conceptId: query.conceptId,
        templateId: `${query.conceptId}_tmpl_${(questionCounter % 5) + 1}`,
        difficultyBand: query.difficulty ?? 'medium',
        method: methods[questionCounter % methods.length],
        topicWrapper: wrappers[questionCounter % wrappers.length],
        prompt: `[${query.mode}] Practice item ${i + 1} for ${query.conceptId}`,
      };
    });
  }
}

export class MockReadinessPort implements ReadinessPort {
  public received: Array<{ studentId: string; conceptId: string; evidence: PressureEvidence }> = [];
  async reportPressureEvidence(studentId: string, conceptId: string, evidence: PressureEvidence) {
    this.received.push({ studentId, conceptId, evidence });
  }
}

export class MockInterventionPort implements InterventionPort {
  public escalations: Array<{ studentId: string; conceptId: string; reason: string }> = [];
  async escalate(studentId: string, conceptId: string, reason: string) {
    this.escalations.push({ studentId, conceptId, reason });
  }
}

export class MockReasoningPort implements ReasoningPort {
  async getReasoningSignal(): Promise<ReasoningSignal | null> {
    return null; // "unknown" — the engine treats this as missing evidence, never as zero.
  }
}
