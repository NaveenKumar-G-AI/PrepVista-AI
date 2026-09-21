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
import { QuestionRepository } from './repository.js';

export class MemoryRepository implements QuestionRepository {
  private questions = new Map<string, Question>();
  private versions = new Map<string, QuestionVersion>();
  private versionsByQuestion = new Map<string, string[]>(); // questionId -> versionId[]
  private validations = new Map<string, ValidationRecord[]>(); // versionId -> records
  private issues = new Map<string, Issue[]>(); // versionId -> issues
  private reports = new Map<string, ReportRecord[]>(); // questionId -> reports
  private reviews = new Map<string, ReviewRecord[]>(); // versionId -> reviews
  private audit = new Map<string, AuditEvent[]>(); // questionId -> events
  private historicalStats = new Map<string, HistoricalStats>();
  private families = new Map<string, QuestionFamily>();

  getQuestion(id: string): Question | undefined {
    const q = this.questions.get(id);
    // Defensive copy: LifecycleService.transition() intentionally mutates its Question argument
    // in place. If we handed back the live map reference here, any caller holding an earlier
    // getQuestion() result would be silently mutated by an unrelated later call (e.g. two
    // "simultaneous" reviewers would stop being a meaningful test — see tests/reviewConcurrencyAndRoles.test.ts).
    return q ? { ...q } : undefined;
  }
  saveQuestion(q: Question): void {
    this.questions.set(q.id, { ...q });
  }
  listQuestions(filter?: { tenantId?: string; includeGlobal?: boolean }): Question[] {
    const all = [...this.questions.values()];
    if (!filter?.tenantId) return all;
    return all.filter((q) => q.tenantId === filter.tenantId || (filter.includeGlobal && q.isGlobal));
  }

  getVersion(id: string): QuestionVersion | undefined {
    const v = this.versions.get(id);
    return v ? { ...v } : undefined;
  }
  getCurrentVersion(questionId: string): QuestionVersion | undefined {
    const q = this.questions.get(questionId);
    if (!q?.currentVersionId) return undefined;
    return this.versions.get(q.currentVersionId);
  }
  saveVersion(v: QuestionVersion): void {
    this.versions.set(v.id, { ...v });
    const list = this.versionsByQuestion.get(v.questionId) ?? [];
    if (!list.includes(v.id)) {
      list.push(v.id);
      this.versionsByQuestion.set(v.questionId, list);
    }
  }
  listVersions(questionId: string): QuestionVersion[] {
    return (this.versionsByQuestion.get(questionId) ?? [])
      .map((id) => this.versions.get(id))
      .filter((v): v is QuestionVersion => Boolean(v))
      .sort((a, b) => a.versionNumber - b.versionNumber);
  }

  saveValidation(v: ValidationRecord): void {
    const list = this.validations.get(v.questionVersionId) ?? [];
    list.push({ ...v });
    this.validations.set(v.questionVersionId, list);
  }
  listValidations(versionId: string): ValidationRecord[] {
    return [...(this.validations.get(versionId) ?? [])];
  }

  saveIssue(i: Issue): void {
    const key = i.questionVersionId ?? '';
    const list = this.issues.get(key) ?? [];
    list.push({ ...i });
    this.issues.set(key, list);
  }
  listIssues(versionId: string): Issue[] {
    return [...(this.issues.get(versionId) ?? [])];
  }
  updateIssueStatus(issueId: string, status: Issue['status'], resolvedAt?: string): void {
    for (const [key, list] of this.issues) {
      const idx = list.findIndex((i) => i.id === issueId);
      if (idx >= 0) {
        list[idx] = { ...list[idx], status, resolvedAt };
        this.issues.set(key, list);
        return;
      }
    }
  }

  saveReport(r: ReportRecord): void {
    const list = this.reports.get(r.questionId) ?? [];
    list.push({ ...r });
    this.reports.set(r.questionId, list);
  }
  listReports(questionId: string): ReportRecord[] {
    return [...(this.reports.get(questionId) ?? [])];
  }

  saveReview(r: ReviewRecord): void {
    const list = this.reviews.get(r.questionVersionId) ?? [];
    list.push({ ...r });
    this.reviews.set(r.questionVersionId, list);
  }
  listReviews(versionId: string): ReviewRecord[] {
    return [...(this.reviews.get(versionId) ?? [])];
  }

  appendAudit(e: AuditEvent): void {
    const list = this.audit.get(e.questionId) ?? [];
    list.push({ ...e });
    this.audit.set(e.questionId, list);
  }
  listAudit(questionId: string): AuditEvent[] {
    return [...(this.audit.get(questionId) ?? [])];
  }

  getHistoricalStats(questionId: string): HistoricalStats | undefined {
    return this.historicalStats.get(questionId);
  }
  setHistoricalStats(questionId: string, stats: HistoricalStats): void {
    this.historicalStats.set(questionId, stats);
  }

  listPool(filter?: { skill?: string; excludeQuestionId?: string }): QuestionVersion[] {
    const currentVersions = [...this.questions.values()]
      .filter((q) => q.id !== filter?.excludeQuestionId)
      .map((q) => (q.currentVersionId ? this.versions.get(q.currentVersionId) : undefined))
      .filter((v): v is QuestionVersion => Boolean(v));
    if (!filter?.skill) return currentVersions;
    return currentVersions.filter((v) => v.skillMapping?.primarySkill === filter.skill);
  }

  saveFamily(f: QuestionFamily): void {
    this.families.set(f.id, { ...f });
  }
  listFamilies(): QuestionFamily[] {
    return [...this.families.values()];
  }
}
