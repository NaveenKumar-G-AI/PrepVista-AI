import {
  AuditEvent,
  HistoricalStats,
  Issue,
  Question,
  QuestionFamily,
  QuestionVersion,
  ReportRecord,
  ReviewRecord,
  ValidationRecord,
} from '../types/domain.js';

/**
 * Everything the services in src/services need from storage, and nothing more. The reference
 * implementation (memoryRepository.ts) backs this with plain Maps so the whole engine runs and
 * tests pass with zero external services. db/schema.sql defines the equivalent Postgres tables —
 * write a new class implementing this same interface against a real driver (pg, Prisma, etc.) to
 * go from "trust engine" to "trust engine wired to your actual database", without touching any
 * validator or service code.
 */
export interface QuestionRepository {
  getQuestion(id: string): Question | undefined;
  saveQuestion(q: Question): void;
  listQuestions(filter?: { tenantId?: string; includeGlobal?: boolean }): Question[];

  getVersion(id: string): QuestionVersion | undefined;
  getCurrentVersion(questionId: string): QuestionVersion | undefined;
  saveVersion(v: QuestionVersion): void;
  listVersions(questionId: string): QuestionVersion[];

  saveValidation(v: ValidationRecord): void;
  listValidations(versionId: string): ValidationRecord[];

  saveIssue(i: Issue): void;
  listIssues(versionId: string): Issue[];
  updateIssueStatus(issueId: string, status: Issue['status'], resolvedAt?: string): void;

  saveReport(r: ReportRecord): void;
  listReports(questionId: string): ReportRecord[];

  saveReview(r: ReviewRecord): void;
  listReviews(versionId: string): ReviewRecord[];

  appendAudit(e: AuditEvent): void;
  listAudit(questionId: string): AuditEvent[];

  getHistoricalStats(questionId: string): HistoricalStats | undefined;
  setHistoricalStats(questionId: string, stats: HistoricalStats): void;

  /** Other active questions to compare against for similarity/duplicate checks — ideally
   *  pre-filtered by skill by the caller. Excludes the given questionId. */
  listPool(filter?: { skill?: string; excludeQuestionId?: string }): QuestionVersion[];

  saveFamily(f: QuestionFamily): void;
  listFamilies(): QuestionFamily[];
}
