/**
 * FOR TESTS ONLY. These let the engine's own logic (selection,
 * orchestration, evaluation) be unit tested without a real database,
 * execution sandbox, or AI provider. Do not use these in production —
 * production must use the real adapters described in adapters.ts.
 */

import { ChallengeRepository, Challenge, ExposureRepository, ExposureRecord, EventLoggerAdapter, MasteryEvidenceSink, RoadmapService, InterviewEvidencePacket } from './adapters';
import { ReportRepository, StoredInterviewReport } from '../services/reportPersistence';

export class InMemoryChallengeRepository implements ChallengeRepository {
  constructor(private challenges: Challenge[]) {}
  async findCandidates(criteria: { competencies: string[]; difficulty?: string; excludeChallengeIds: string[] }): Promise<Challenge[]> {
    return this.challenges.filter(c =>
      c.competencies.some(comp => criteria.competencies.includes(comp)) &&
      (!criteria.difficulty || c.difficulty === criteria.difficulty) &&
      !criteria.excludeChallengeIds.includes(c.id),
    );
  }
}

export class InMemoryExposureRepository implements ExposureRepository {
  constructor(private records: Map<string, ExposureRecord>) {} // key: `${studentId}:${challengeId}`
  async getExposure(studentId: string, challengeIds: string[]): Promise<ExposureRecord[]> {
    return challengeIds.map(id => this.records.get(`${studentId}:${id}`) ?? {
      challengeId: id, viewedAt: null, attemptedAt: null, solvedAt: null, usedInAssessmentAt: null, usedInInterviewAt: null,
    });
  }
}

export class InMemoryEventLogger implements EventLoggerAdapter {
  public events: { interviewId: string; eventType: string; payload: Record<string, unknown>; createdBy: string }[] = [];
  async log(interviewId: string, eventType: string, payload: Record<string, unknown>, createdBy: 'STUDENT' | 'SYSTEM' | 'AI' | 'INTERVIEWER') {
    this.events.push({ interviewId, eventType, payload, createdBy });
  }
}

export class NoopMasterySink implements MasteryEvidenceSink {
  public received: InterviewEvidencePacket[] = [];
  async recordInterviewEvidence(packet: InterviewEvidencePacket) { this.received.push(packet); }
}

export class NoopRoadmapService implements RoadmapService {
  public triggeredFor: string[] = [];
  async triggerRecalculation(studentId: string) { this.triggeredFor.push(studentId); }
}

export class InMemoryReportRepository implements ReportRepository {
  private byInterviewId = new Map<string, StoredInterviewReport>();
  async save(report: StoredInterviewReport) { this.byInterviewId.set(report.interviewId, report); }
  async findLatest(interviewId: string) { return this.byInterviewId.get(interviewId) ?? null; }
}
